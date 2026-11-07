"""Bounded AST-based dependency analysis for a commit tree."""

import ast
import io
import tokenize
from collections import defaultdict, deque
from itertools import islice

from flask import current_app
from git import BadObject, GitCommandError, NULL_TREE

from ..utils.errors import ApiError
from .git_service import _commit_summary, resolve_commit
from .repository_service import get_registered_repository


def analyze_commit_dependencies(repository_id: str, commit_hash: str) -> dict:
    """Inspect Python imports and report dependents of Python files changed by a commit."""
    _, repository = get_registered_repository(repository_id)
    commit = resolve_commit(repository, commit_hash)
    base_commit = commit.parents[0] if commit.parents else None
    config = current_app.config

    try:
        diff = (
            base_commit.diff(commit, create_patch=False, find_renames=True)
            if base_commit is not None
            else commit.diff(NULL_TREE, create_patch=False, find_renames=True)
        )
        changed_items = list(
            islice(diff, config["MAX_DEPENDENCY_FILES"] + 1)
        )
        tree_entries = commit.tree.traverse()
        files, scan_info = _read_python_files(tree_entries, config)
    except (BadObject, GitCommandError, ValueError, OSError) as error:
        raise ApiError(
            "DEPENDENCY_ANALYSIS_UNAVAILABLE",
            "Dependency analysis could not read the requested commit.",
            422,
        ) from error

    aliases = _module_aliases(files)
    packages = _package_aliases(files)
    changed_paths, changed_truncated = _changed_python_paths(
        changed_items,
        min(config["MAX_DEPENDENCY_FILES"], config["MAX_DEPENDENCY_RESULTS"]),
    )
    deleted_paths = _deleted_changed_paths(changed_paths, scan_info)
    aliases = _include_changed_paths(aliases, deleted_paths)
    syntax_errors = []
    unresolved_imports = []
    edges = []
    reverse_edges: dict[str, set[str]] = defaultdict(set)
    edge_keys = set()
    imports_examined = 0
    import_truncated = False
    edges_truncated = False

    for item in files:
        if item["syntaxError"]:
            syntax_errors.append(
                {
                    "path": item["path"],
                    "line": item["syntaxError"]["line"],
                    "message": item["syntaxError"]["message"],
                }
            )
            continue
        for imported in item["imports"]:
            if imports_examined >= config["MAX_DEPENDENCY_IMPORTS"]:
                import_truncated = True
                break
            imports_examined += 1
            targets, reason, candidates = _resolve_import(
                item, imported, aliases, packages
            )
            if reason:
                unresolved_imports.append(
                    {
                        "path": item["path"],
                        "module": imported["module"],
                        "level": imported["level"],
                        "reason": reason,
                        "candidates": candidates,
                    }
                )
            if not targets:
                continue
            for target in targets:
                edge_key = (item["path"], target)
                if edge_key in edge_keys:
                    continue
                if len(edges) >= config["MAX_DEPENDENCY_EDGES"]:
                    edges_truncated = True
                    break
                edge_keys.add(edge_key)
                edges.append({"from": item["path"], "to": target})
                reverse_edges[target].add(item["path"])
        if import_truncated or edges_truncated:
            break

    direct, indirect, graph_truncated = _find_dependents(
        changed_paths,
        reverse_edges,
        max_depth=config["MAX_DEPENDENCY_DEPTH"],
        max_nodes=config["MAX_DEPENDENCY_NODES"],
        max_results=config["MAX_DEPENDENCY_RESULTS"],
    )
    nodes, nodes_truncated = _graph_nodes(
        files, deleted_paths, config["MAX_DEPENDENCY_NODES"]
    )
    return {
        "commit": _commit_summary(repository, commit),
        "baseCommit": _commit_summary(repository, base_commit) if base_commit else None,
        "baseStrategy": "first_parent" if base_commit else "empty_tree",
        "changedFiles": changed_paths,
        "graph": {
            "nodes": nodes,
            "edges": edges,
            "directDependents": direct,
            "indirectDependents": indirect,
        },
        "syntaxErrors": syntax_errors,
        "unresolvedImports": unresolved_imports,
        "summary": {
            "pythonFilesScanned": scan_info["pythonFilesScanned"],
            "treeEntriesScanned": scan_info["treeEntriesScanned"],
            "totalBytesRead": scan_info["totalBytesRead"],
            "parsedFiles": sum(1 for item in files if item["syntaxError"] is None),
            "syntaxErrorCount": len(syntax_errors),
            "unresolvedImportCount": len(unresolved_imports),
            "directDependentCount": len(direct),
            "indirectDependentCount": len(indirect),
            "treeEntriesTruncated": scan_info["treeEntriesTruncated"],
            "filesTruncated": scan_info["filesTruncated"],
            "changedFilesTruncated": changed_truncated,
            "importsTruncated": import_truncated,
            "edgesTruncated": edges_truncated,
            "graphTruncated": graph_truncated,
            "nodesTruncated": nodes_truncated,
            "truncated": (
                scan_info["treeEntriesTruncated"]
                or scan_info["filesTruncated"]
                or changed_truncated
                or import_truncated
                or edges_truncated
                or graph_truncated
                or nodes_truncated
            ),
        },
        "limits": {
            "maxTreeEntries": config["MAX_DEPENDENCY_TREE_ENTRIES"],
            "maxFiles": config["MAX_DEPENDENCY_FILES"],
            "maxFileBytes": config["MAX_DEPENDENCY_FILE_BYTES"],
            "maxTotalBytes": config["MAX_DEPENDENCY_TOTAL_BYTES"],
            "maxNodes": config["MAX_DEPENDENCY_NODES"],
            "maxEdges": config["MAX_DEPENDENCY_EDGES"],
            "maxImports": config["MAX_DEPENDENCY_IMPORTS"],
            "maxDepth": config["MAX_DEPENDENCY_DEPTH"],
            "maxResults": config["MAX_DEPENDENCY_RESULTS"],
        },
    }


def _read_python_files(tree_entries, config: dict) -> tuple[list[dict], dict]:
    files = []
    tree_entry_count = 0
    python_file_count = 0
    total_bytes = 0
    tree_entries_truncated = False
    files_truncated = False
    tree_python_paths = set()

    for entry in tree_entries:
        tree_entry_count += 1
        if tree_entry_count > config["MAX_DEPENDENCY_TREE_ENTRIES"]:
            tree_entries_truncated = True
            break
        if entry.type != "blob" or not entry.path.casefold().endswith(".py"):
            continue
        tree_python_paths.add(entry.path)
        if entry.mode == 0o120000:
            continue

        if (
            python_file_count >= config["MAX_DEPENDENCY_FILES"]
            or python_file_count >= config["MAX_DEPENDENCY_NODES"]
        ):
            files_truncated = True
            break
        python_file_count += 1
        if (
            entry.size > config["MAX_DEPENDENCY_FILE_BYTES"]
            or total_bytes + entry.size > config["MAX_DEPENDENCY_TOTAL_BYTES"]
        ):
            files_truncated = True
            continue

        raw_source = entry.data_stream.read(config["MAX_DEPENDENCY_FILE_BYTES"] + 1)
        if len(raw_source) > config["MAX_DEPENDENCY_FILE_BYTES"]:
            files_truncated = True
            continue
        total_bytes += len(raw_source)
        source, decode_error = _decode_source(raw_source)
        module = _path_to_module(entry.path)
        item = {
            "path": entry.path,
            "module": module,
            "imports": [],
            "syntaxError": None,
        }
        if decode_error:
            item["syntaxError"] = {"line": None, "message": decode_error}
        else:
            try:
                syntax_tree = ast.parse(source, filename=entry.path)
            except SyntaxError as error:
                item["syntaxError"] = {
                    "line": error.lineno,
                    "message": (error.msg or "Invalid Python syntax")[:200],
                }
            except RecursionError:
                item["syntaxError"] = {
                    "line": None,
                    "message": "AST nesting exceeds the parser recursion limit",
                }
            else:
                item["imports"] = _extract_imports(syntax_tree)
        files.append(item)

    return files, {
        "pythonFilesScanned": python_file_count,
        "treeEntriesScanned": min(tree_entry_count, config["MAX_DEPENDENCY_TREE_ENTRIES"]),
        "totalBytesRead": total_bytes,
        "treeEntriesTruncated": tree_entries_truncated,
        "filesTruncated": files_truncated,
        "treePythonPaths": tree_python_paths,
    }


def _decode_source(raw_source: bytes) -> tuple[str | None, str | None]:
    try:
        encoding, _ = tokenize.detect_encoding(io.BytesIO(raw_source).readline)
        return raw_source.decode(encoding), None
    except (SyntaxError, UnicodeDecodeError, LookupError) as error:
        return None, f"Source encoding could not be decoded: {str(error)[:160]}"


def _extract_imports(syntax_tree: ast.AST) -> list[dict]:
    imports = []
    for node in ast.walk(syntax_tree):
        if isinstance(node, ast.Import):
            imports.extend(
                {"module": alias.name, "level": 0, "names": []}
                for alias in node.names
            )
        elif isinstance(node, ast.ImportFrom):
            imports.append(
                {
                    "module": node.module or "",
                    "level": node.level,
                    "names": [alias.name for alias in node.names if alias.name != "*"],
                }
            )
    return imports


def _path_to_module(path: str) -> str:
    parts = path[:-3].split("/")
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def _module_aliases(files: list[dict]) -> dict[str, set[str]]:
    aliases: dict[str, set[str]] = defaultdict(set)
    for item in files:
        if item["path"].endswith("/__init__.py") or item["path"] == "__init__.py":
            continue
        parts = item["module"].split(".") if item["module"] else []
        if not parts:
            continue
        for offset in range(len(parts)):
            aliases[".".join(parts[offset:])].add(item["path"])
    return aliases


def _include_changed_paths(
    aliases: dict[str, set[str]], changed_paths: list[str]
) -> dict[str, set[str]]:
    for path in changed_paths:
        module = _path_to_module(path)
        parts = module.split(".") if module else []
        for offset in range(len(parts)):
            aliases[".".join(parts[offset:])].add(path)
    return aliases


def _graph_nodes(
    files: list[dict], deleted_paths: list[str], limit: int
) -> tuple[list[dict], bool]:
    file_nodes = {
        item["path"]: {"path": item["path"], "module": item["module"], "present": True}
        for item in files
    }
    for path in deleted_paths:
        file_nodes.setdefault(
            path,
            {"path": path, "module": _path_to_module(path), "present": False},
        )
    changed = set(deleted_paths)
    ordered_paths = sorted(changed) + sorted(set(file_nodes) - changed)
    nodes = [file_nodes[path] for path in ordered_paths[:limit]]
    return nodes, len(ordered_paths) > limit


def _deleted_changed_paths(changed_paths: list[str], scan_info: dict) -> list[str]:
    if scan_info["treeEntriesTruncated"]:
        return []
    present_paths = scan_info["treePythonPaths"]
    return [path for path in changed_paths if path not in present_paths]


def _package_aliases(files: list[dict]) -> dict[str, set[str]]:
    aliases: dict[str, set[str]] = defaultdict(set)
    for item in files:
        if not item["path"].endswith("/__init__.py") or not item["module"]:
            continue
        parts = item["module"].split(".")
        for offset in range(len(parts)):
            aliases[".".join(parts[offset:])].add(item["path"])
    return aliases


def _module_targets(
    module: str,
    aliases: dict[str, set[str]],
    packages: dict[str, set[str]],
) -> set[str]:
    exact_targets = set(aliases.get(module, set()))
    if exact_targets:
        return exact_targets
    return set(packages.get(module, set()))


def _resolve_import(
    importer: dict,
    imported: dict,
    aliases: dict[str, set[str]],
    packages: dict[str, set[str]],
) -> tuple[list[str], str | None, list[str]]:
    module = imported["module"]
    level = imported["level"]
    if level:
        package_parts = (
            importer["module"].split(".")
            if importer["path"].endswith("/__init__.py")
            else importer["module"].split(".")[:-1]
        )
        ascend = level - 1
        if not package_parts or (ascend >= len(package_parts) and ascend):
            return [], "relative_import_outside_package", []
        if ascend:
            package_parts = package_parts[:-ascend]
        target_parts = package_parts + (module.split(".") if module else [])
        target = ".".join(target_parts)
        targets = _module_targets(target, aliases, packages) if target else set()
    else:
        target = module
        targets = _module_targets(module, aliases, packages) if module else set()
    if len(targets) > 1:
        return sorted(targets), "ambiguous_local_module", sorted(targets)[:10]

    ambiguous_candidates = []
    if imported["names"]:
        for name in imported["names"]:
            possible_module = f"{target}.{name}" if target else name
            named_targets = set(aliases.get(possible_module, set()))
            if len(named_targets) == 1:
                targets.update(named_targets)
            elif len(named_targets) > 1:
                ambiguous_candidates.extend(sorted(named_targets))

    if ambiguous_candidates:
        return (
            sorted(targets),
            "ambiguous_imported_name",
            sorted(set(ambiguous_candidates))[:10],
        )
    if targets:
        return sorted(targets), None, []
    return [], "not_found_in_commit", []


def _changed_python_paths(changed_items: list, limit: int) -> tuple[list[str], bool]:
    truncated = len(changed_items) > limit
    changed = set()
    for item in changed_items[:limit]:
        for path in (item.b_path, item.a_path):
            if path and path.casefold().endswith(".py"):
                changed.add(path)
    return sorted(changed), truncated


def _find_dependents(
    changed_paths: list[str],
    reverse_edges: dict[str, set[str]],
    *,
    max_depth: int,
    max_nodes: int,
    max_results: int,
) -> tuple[list[dict], list[dict], bool]:
    direct = set()
    indirect: dict[str, int] = {}
    visited = set(changed_paths)
    queue = deque((path, 0) for path in changed_paths)
    truncated = False
    while queue:
        target, depth = queue.popleft()
        if depth >= max_depth:
            if reverse_edges.get(target):
                truncated = True
            continue
        for dependent in sorted(reverse_edges.get(target, ())):
            if dependent in visited:
                continue
            if (
                len(visited) >= max_nodes
                or len(direct) + len(indirect) >= max_results
            ):
                truncated = True
                queue.clear()
                break
            visited.add(dependent)
            queue.append((dependent, depth + 1))
            if depth == 0:
                direct.add(dependent)
            else:
                indirect[dependent] = depth + 1

    return (
        [{"path": path, "depth": 1} for path in sorted(direct)],
        [
            {"path": path, "depth": depth}
            for path, depth in sorted(indirect.items())
        ],
        truncated,
    )
