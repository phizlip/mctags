export class TreeView {
    constructor(containerId, onSelect) {
        this.container = document.getElementById(containerId);
        this.onSelect = onSelect;
        this.flatTags = [];
        this.allElements = [];
        this.root = null;
        this.expandedPaths = new Set(['data', 'data/minecraft', 'data/minecraft/tags']);
        this.savedExpandedPaths = null;
        this.searchTerm = '';
    }

    init(graphData) {
        this.allElements = graphData.elements
            .filter(el => el.data && (el.data.type === 'tag' || el.data.type === 'element'))
            .map(el => el.data);

        this.flatTags = this.allElements.filter(el => el.type === 'tag' && el.path);

        this.buildTree();
        this.render();
    }

    buildTree() {
        this.root = { name: 'root', children: {}, isFolder: true, path: '' };

        const itemsToProcess = this.searchTerm ? this.allElements : this.flatTags;
        let matchesFound = 0;

        const resultsRoot = 'Results';

        itemsToProcess.forEach(item => {
            const matches = item.id.toLowerCase().includes(this.searchTerm) || (item.label && item.label.toLowerCase().includes(this.searchTerm));
            if (this.searchTerm && !matches) return;
            matchesFound++;

            const isTagMatch = item.type === 'tag';

            if (this.searchTerm && !isTagMatch) {
                if (!this.root.children[resultsRoot]) {
                    this.root.children[resultsRoot] = {
                        name: resultsRoot,
                        path: resultsRoot,
                        children: {},
                        isFolder: true,
                        type: 'folder'
                    };
                    this.expandedPaths.add(resultsRoot);
                }

                let category = item.category || 'other';
                category = category.charAt(0).toUpperCase() + category.slice(1) + 's';
                const catPath = `${resultsRoot}/${category}`;

                if (!this.root.children[resultsRoot].children[category]) {
                    this.root.children[resultsRoot].children[category] = {
                        name: category,
                        path: catPath,
                        children: {},
                        isFolder: true,
                        type: 'folder'
                    };
                    this.expandedPaths.add(catPath);
                }

                const name = item.id.split(':').pop();
                const itemPath = `${catPath}/${item.id}`;

                this.root.children[resultsRoot].children[category].children[item.id] = {
                    name: name,
                    path: itemPath,
                    children: {},
                    isFolder: false,
                    tagId: item.id,
                    label: item.label,
                    type: 'element'
                };
            } else if (item.path) {
                const parts = item.path.split('/');
                let current = this.root;

                parts.forEach((part, index) => {
                    const isFile = index === parts.length - 1;
                    const pathSoFar = parts.slice(0, index + 1).join('/');

                    if (!current.children[part]) {
                        current.children[part] = {
                            name: part,
                            path: pathSoFar,
                            children: {},
                            isFolder: !isFile,
                            tagId: isFile ? item.id : null,
                            label: isFile ? item.label : part,
                            type: isFile ? 'tag' : 'folder'
                        };
                    }
                    if (this.searchTerm) {
                        this.expandedPaths.add(pathSoFar);
                    }
                    current = current.children[part];
                });
            }
        });

        if (this.searchTerm && this.root.children[resultsRoot]) {
            const categories = this.root.children[resultsRoot].children;
            Object.keys(categories).forEach(key => {
                const node = categories[key];
                const count = Object.keys(node.children).length;
                node.name = `${key} (${count})`;
            });
        }

        this.matchesFound = matchesFound;
    }

    highlightMatch(text, term) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escaped})`, 'gi');
        return text.replace(regex, '<span class="search-match">$1</span>');
    }

    setSearchTerm(term) {
        const newTerm = term.toLowerCase().trim();
        const wasEmpty = this.searchTerm === '';
        const isEmpty = newTerm === '';

        if (wasEmpty && !isEmpty) {
            this.savedExpandedPaths = new Set(this.expandedPaths);
        }

        this.searchTerm = newTerm;

        if (isEmpty && this.savedExpandedPaths) {
            this.expandedPaths = new Set(this.savedExpandedPaths);
            this.savedExpandedPaths = null;
        }

        this.buildTree();
        if (this.searchTerm) this.expandAllMatching();
        this.render();
    }

    expandAllMatching() {
        const recurse = (node) => {
            if (node.isFolder) {
                this.expandedPaths.add(node.path);
                Object.values(node.children).forEach(recurse);
            }
        };
        Object.values(this.root.children).forEach(recurse);
    }

    togglePath(path) {
        if (this.expandedPaths.has(path)) {
            this.expandedPaths.delete(path);
        } else {
            this.expandedPaths.add(path);
        }
        this.render();
    }

    render() {
        const renderNode = (node) => {
            const isExpanded = this.expandedPaths.has(node.path);
            const displayName = this.searchTerm ? this.highlightMatch(node.name, this.searchTerm) : node.name;

            if (node.isFolder) {
                const childKeys = Object.keys(node.children).sort();

                const expanded = isExpanded;

                let childrenHtml = '';
                if (expanded && childKeys.length > 0) {
                    childrenHtml = `<ul class="tree-group">
                        ${childKeys.map(k => renderNode(node.children[k])).join('')}
                    </ul>`;
                }

                const chevronSvg = expanded
                    ? '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 16 16"><path d="M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.939l3.72-3.719a.749.749 0 0 1 1.06 0Z"/></svg>'
                    : '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 16 16"><path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/></svg>';

                let itemClass = 'tree-item tree-folder';

                return `
                    <li class="tree-node">
                        <div class="${itemClass}" data-path="${node.path}">
                            <span class="tree-icon">${chevronSvg}</span>
                            <span class="tree-label">${displayName}</span>
                        </div>
                        ${childrenHtml}
                    </li>
                `;
            } else {
                const isTag = node.type === 'tag';
                const tagSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 16 16"><path d="M1 7.775V2a1 1 0 0 1 1-1h5.775a1 1 0 0 1 .707.293l6.225 6.225a1 1 0 0 1 0 1.414l-5.775 5.775a1 1 0 0 1-1.414 0L1.293 8.482A1 1 0 0 1 1 7.775Zm1.5-.275 5.5 5.5L13.5 7.5 8 2H2.5v5.5ZM5 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/></svg>';
                // octicon:package
                const packageSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 16 16"><path d="m8.878.392 5.25 3.045c.54.314.872.89.872 1.514v6.098a1.75 1.75 0 0 1-.872 1.514l-5.25 3.045a1.75 1.75 0 0 1-1.756 0l-5.25-3.045A1.75 1.75 0 0 1 1 11.049V4.951c0-.624.332-1.2.872-1.514L7.122.392a1.75 1.75 0 0 1 1.756 0ZM7.875 1.69l-4.63 2.685L8 7.133l4.755-2.758-4.63-2.685a.25.25 0 0 0-.25 0ZM2.5 5.677v5.372c0 .09.047.171.125.216l4.625 2.683V8.732Zm11 5.372V5.677L8.75 8.732v5.216l4.625-2.683a.25.25 0 0 0 .125-.216Z"/></svg>';

                const iconSvg = isTag ? tagSvg : packageSvg;
                const itemClass = isTag ? 'tree-item tree-tag' : 'tree-item tree-element';

                const label = node.name.replace('.json', '');
                const displayLabel = this.searchTerm ? this.highlightMatch(label, this.searchTerm) : label;

                return `
                    <li class="tree-node">
                        <div class="${itemClass}" data-tag-id="${node.tagId}">
                             <span class="tree-icon-file">${iconSvg}</span>
                             <span class="tree-label">${displayLabel}</span>
                        </div>
                    </li>
                `;
            }
        };

        const topLevelKeys = Object.keys(this.root.children).sort((a, b) => {
            if (a === 'Results' && b !== 'Results') return -1;
            if (a !== 'Results' && b === 'Results') return 1;
            return a.localeCompare(b);
        });

        if (this.searchTerm && this.matchesFound === 0) {
            this.container.innerHTML = `<div class="tree-no-results">No matches found for "${this.searchTerm}"</div>`;
            return;
        }


        this.container.innerHTML = `<ul class="tree-root">
            ${topLevelKeys.map(k => renderNode(this.root.children[k])).join('')}
        </ul>`;

        this.attachEventListeners();
    }

    attachEventListeners() {
        this.container.querySelectorAll('.tree-folder').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                this.togglePath(el.dataset.path);
            });
        });

        const selectNodes = this.container.querySelectorAll('.tree-tag, .tree-element');
        selectNodes.forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                selectNodes.forEach(t => t.classList.remove('selected'));
                el.classList.add('selected');
                this.onSelect(el.dataset.tagId);
            });
        });
    }
}
