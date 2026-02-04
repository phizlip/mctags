import { MinecraftData } from './minecraft-data.js';
import { TagGraph } from './graph.js';
import { TreeView } from './tree-view.js';

const ui = {
    loadingModal: document.getElementById('loading-modal'),
    progressBar: document.getElementById('progress-bar'),
    progressText: document.getElementById('progress-text'),
    app: document.getElementById('app'),
    tabsBar: document.getElementById('tabs-bar'),
    breadcrumbsBar: document.getElementById('breadcrumbs-bar'),
    versionSelect: document.getElementById('version-select'),
    loadBtn: document.getElementById('load-btn'),
    typeSelect: document.getElementById('type-select'),
    detailsPanel: document.getElementById('details-panel'),
    detailTitle: document.getElementById('detail-title'),
    detailPath: document.getElementById('detail-path'),

    tabRelations: document.getElementById('tab-relations'),
    tabJson: document.getElementById('tab-json'),
    viewRelations: document.getElementById('detail-view-relations'),
    viewJson: document.getElementById('detail-view-json'),
    jsonContent: document.getElementById('json-content'),

    detailChildren: document.getElementById('detail-children'),
    detailParents: document.getElementById('detail-parents'),
    detailChildCount: document.getElementById('detail-child-count'),
    detailParentCount: document.getElementById('detail-parent-count'),

    treeSearch: document.getElementById('tree-search'),
    searchClearBtn: document.getElementById('search-clear-btn'),
    resetBtn: document.getElementById('reset-view-btn'),
    aboutModal: document.getElementById('about-modal'),
    aboutCloseBtn: document.getElementById('about-close-btn')
};


if (ui.tabRelations && ui.tabJson) {
    ui.tabRelations.addEventListener('click', () => {
        ui.tabRelations.classList.add('active');
        ui.tabJson.classList.remove('active');
        ui.viewRelations.classList.remove('hidden');
        ui.viewJson.classList.add('hidden');
    });

    ui.tabJson.addEventListener('click', () => {
        ui.tabJson.classList.add('active');
        ui.tabRelations.classList.remove('active');
        ui.viewJson.classList.remove('hidden');
        ui.viewRelations.classList.add('hidden');
    });
}

const mcData = new MinecraftData();
let graph = null;
let treeView = null;
let graphData = null;


const tabManager = {
    tabs: [],
    activeTabId: null,
    dragSrcEl: null,

    init() {
        this.render();
        this.initDragDrop();
    },

    openTab(id, label, background = false) {
        const existing = this.tabs.find(t => t.id === id);

        let displayLabel = label;
        if (!label || label === id) {
            displayLabel = id.split(/[:/]/).pop();
        }

        if (!existing) {
            this.tabs.push({ id, label: displayLabel });
        }
        if (!background) {
            this.activateTab(id);
        } else {
            this.render(); // Ensure tab appears even if not activated
        }
    },

    closeTab(id, event) {
        if (event) event.stopPropagation();

        const index = this.tabs.findIndex(t => t.id === id);
        if (index === -1) return;

        this.tabs.splice(index, 1);

        if (this.activeTabId === id) {
            if (this.tabs.length > 0) {
                const newIndex = Math.max(0, index - 1);
                this.activateTab(this.tabs[newIndex].id);
            } else {
                this.activeTabId = null;
                document.title = 'mctags.dev';
                if (graph) graph.showEmptyState();
                if (ui.detailsPanel) ui.detailsPanel.classList.add('hidden');
                this.render();
            }
        } else {
            this.render();
        }
    },

    clear() {
        this.tabs = [];
        this.activeTabId = null;
        document.title = 'mctags.dev';
        if (ui.detailsPanel) ui.detailsPanel.classList.add('hidden');
        this.render();
    },

    activateTab(id) {
        this.activeTabId = id;
        this.render();

        // Update browser tab title to show short name
        document.title = id.split(/[:/]/).pop();

        if (graph) graph.showFocusedSubgraph(id);
        const nodeData = graphData.elements.find(el => el.data && el.data.id === id);
        if (nodeData) {
            updateDetailsPanel(nodeData.data);

            let displayPath = '';

            if (nodeData.data.path) {
                // It's a real file (Tag)
                displayPath = nodeData.data.path.replace('.json', '');
            } else {
                // It's an element (or unknown). Use the Resource Location.
                // ID is currently category:namespace:name. We want namespace:name.
                const parts = id.split(':');
                if (parts.length >= 3) {
                    const namespace = parts[1];
                    const name = parts.slice(2).join(':'); // elements can have colons? rarely.
                    displayPath = `${namespace}:${name}`;
                } else {
                    displayPath = id; // Fallback
                }
            }
            if (ui.breadcrumbsBar) ui.breadcrumbsBar.textContent = displayPath;

        } else if (ui.breadcrumbsBar) {
            ui.breadcrumbsBar.textContent = '';
        }
    },

    render() {
        if (ui.breadcrumbsBar) {
            if (this.tabs.length === 0) {
                ui.breadcrumbsBar.classList.add('hidden');
                ui.breadcrumbsBar.textContent = '';
            } else {
                ui.breadcrumbsBar.classList.remove('hidden');
            }
        }

        ui.tabsBar.innerHTML = this.tabs.map(tab => `
            <div class="tab ${tab.id === this.activeTabId ? 'active' : ''}" 
                 draggable="true"
                 data-id="${tab.id}"
                 onclick="window.openTab('${tab.id}', '${tab.label}')"
                 onauxclick="if(event.button === 1) { window.closeTab('${tab.id}', event); event.preventDefault(); }">
                <span class="tab-label">${tab.label}</span>
                <span class="tab-close" onclick="window.closeTab('${tab.id}', event)">×</span>
            </div>
        `).join('');

        this.initDragDrop();

        if (typeof graph !== 'undefined' && graph && graph.cy) {
            // Slight delay to ensure DOM reflow has happened
            setTimeout(() => {
                graph.cy.resize();
            }, 0);
        }
    },

    initDragDrop() {
        const tabs = ui.tabsBar.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.addEventListener('dragstart', this.handleDragStart.bind(this));
            tab.addEventListener('dragover', this.handleDragOver.bind(this));
            tab.addEventListener('drop', this.handleDrop.bind(this));
            tab.addEventListener('dragend', this.handleDragEnd.bind(this));
        });
    },

    handleDragStart(e) {
        this.dragSrcEl = e.target.closest('.tab');
        e.target.closest('.tab').classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dragSrcEl.getAttribute('data-id'));
    },

    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const overTab = e.target.closest('.tab');
        if (overTab && overTab !== this.dragSrcEl) {
            const container = ui.tabsBar;
            const tabs = [...container.querySelectorAll('.tab')];
            const srcIndex = tabs.indexOf(this.dragSrcEl);
            const targetIndex = tabs.indexOf(overTab);

            if (srcIndex < targetIndex) {
                container.insertBefore(this.dragSrcEl, overTab.nextElementSibling);
            } else {
                container.insertBefore(this.dragSrcEl, overTab);
            }
        }
    },

    handleDrop(e) {
        e.stopPropagation();
        const newOrderIds = [...ui.tabsBar.querySelectorAll('.tab')].map(el => el.getAttribute('data-id'));
        const newTabs = [];
        newOrderIds.forEach(id => {
            const t = this.tabs.find(tab => tab.id === id);
            if (t) newTabs.push(t);
        });

        this.tabs = newTabs;
        return false;
    },

    handleDragEnd(e) {
        if (this.dragSrcEl) {
            this.dragSrcEl.classList.remove('dragging');
        }
        const tabs = ui.tabsBar.querySelectorAll('.tab');
        tabs.forEach(t => t.classList.remove('dragging'));
    }
};


const resizer = document.getElementById('resizer');
const sidebar = document.getElementById('sidebar');

if (resizer && sidebar) {
    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const newWidth = e.clientX;
        if (newWidth > 150 && newWidth < 600) {
            sidebar.style.width = newWidth + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('resizing');
            document.body.style.cursor = 'default';
            if (graph && graph.cy) graph.cy.resize();
        }
    });
}


const detailsResizer = document.getElementById('details-resizer');
const treeViewEl = document.getElementById('tree-view');
const detailsPanelEl = document.getElementById('details-panel');

if (detailsResizer && treeViewEl && detailsPanelEl) {
    let isResizingDetails = false;
    let startY = 0;
    let startTreeHeight = 0;
    let startDetailsHeight = 0;

    detailsResizer.addEventListener('mousedown', (e) => {
        isResizingDetails = true;
        startY = e.clientY;
        startTreeHeight = treeViewEl.offsetHeight;
        startDetailsHeight = detailsPanelEl.offsetHeight;
        detailsResizer.classList.add('resizing');
        document.body.style.cursor = 'row-resize';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizingDetails) return;

        const deltaY = e.clientY - startY;
        const totalHeight = startTreeHeight + startDetailsHeight;
        const newTreeHeight = startTreeHeight + deltaY;

        // Ensure minimum heights
        if (newTreeHeight > 100 && (totalHeight - newTreeHeight) > 100) {
            const treePercent = (newTreeHeight / totalHeight) * 100;
            const detailsPercent = 100 - treePercent;

            treeViewEl.style.flex = `1 1 ${treePercent}%`;
            detailsPanelEl.style.flex = `1 1 ${detailsPercent}%`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizingDetails) {
            isResizingDetails = false;
            detailsResizer.classList.remove('resizing');
            document.body.style.cursor = 'default';
        }
    });
}

window.openTab = (id, label) => tabManager.activateTab(id);
window.closeTab = (id, e) => tabManager.closeTab(id, e);


let allVersions = [];

async function init() {
    try {
        if (ui.loadingModal) ui.loadingModal.classList.remove('hidden');
        ui.progressText.textContent = 'Fetching manifest...';
        const manifest = await mcData.fetchManifest();
        allVersions = manifest.versions;
        populateVersions();

        const latestSnapshot = manifest.versions.find(v => v.type === 'snapshot');

        if (latestSnapshot) {
            loadVersion(latestSnapshot);
        } else {
            const latestRelease = manifest.versions.find(v => v.type === 'release');
            if (latestRelease) loadVersion(latestRelease);
            else throw new Error("No versions found");
        }

    } catch (e) {
        ui.progressText.textContent = 'Error: ' + e.message;
        console.error(e);
    }
}

function populateVersions() {
    const typeFilter = ui.typeSelect.value;
    const validVersions = [];

    for (const v of allVersions) {
        let matches = false;
        if (typeFilter === 'all') matches = true;
        else if (typeFilter === 'release') matches = v.type === 'release';
        else if (typeFilter === 'snapshot') matches = v.type === 'snapshot';

        if (v.id === '1.13') {
            if (matches) validVersions.push(v);
            break;
        }

        if (matches) {
            validVersions.push(v);
        }
    }

    ui.versionSelect.innerHTML = validVersions.map(v =>
        `<option value="${v.url}">${v.id}</option>`
    ).join('');
}

ui.typeSelect.addEventListener('change', () => {
    populateVersions();
    const versionUrl = ui.versionSelect.value;
    if (versionUrl && versionUrl !== 'Loading...') {
        const versionId = ui.versionSelect.options[ui.versionSelect.selectedIndex].text.split(' ')[0];

        tabManager.clear();

        loadVersion({ id: versionId, url: versionUrl });
        if (graph) graph.showEmptyState();
        if (treeView) treeView.container.innerHTML = '';
        ui.detailsPanel.classList.add('hidden');
        ui.loadingModal.classList.remove('hidden');
    }
});

ui.versionSelect.addEventListener('change', () => {
    const versionUrl = ui.versionSelect.value;
    if (versionUrl && versionUrl !== 'Loading...') {
        const versionId = ui.versionSelect.options[ui.versionSelect.selectedIndex].text.split(' ')[0];

        tabManager.clear();

        loadVersion({ id: versionId, url: versionUrl });
        if (graph) graph.showEmptyState();
        if (treeView) treeView.container.innerHTML = '';
        ui.detailsPanel.classList.add('hidden');
        ui.loadingModal.classList.remove('hidden');
    }
});

async function loadVersion(version) {
    console.log('Loading version:', version.id);
    ui.progressText.textContent = `Downloading ${version.id}...`;

    try {
        const data = await mcData.downloadJar(version.url, (msg, pct) => {
            ui.progressText.textContent = msg;
            ui.progressBar.style.width = pct + '%';
        });

        const extractedData = await mcData.extractTags(data, (msg, pct) => {
            console.log('Progress:', msg, pct);
            ui.progressText.textContent = msg;
            ui.progressBar.style.width = pct + '%';
        });
        console.log('Extraction complete');

        graphData = extractedData;

        ui.loadingModal.classList.add('hidden');

        graph = new TagGraph('cy', onNodeSelect);
        graph.init(graphData.elements);

        graph.onNodeDoubleClick = (nodeId) => {
            // Open tag in new tab
            tabManager.openTab(nodeId, nodeId);
        };

        graph.onNodeMiddleClick = (nodeId) => {
            tabManager.openTab(nodeId, nodeId, true);
        };

        treeView = new TreeView('tree-view', onTagSelect);
        treeView.init(graphData);

        tabManager.init();

    } catch (e) {
        ui.progressText.textContent = 'Error: ' + e.message;
        console.error(e);
    }
}

function onTagSelect(tagId) {
    tabManager.openTab(tagId, tagId);
}

function onNodeSelect(data) {
    if (!data) {
        // ui.detailsPanel.classList.add('hidden'); // Don't hide, maybe show "Nothing selected"
        return;
    }
    updateDetailsPanel(data);
}

function updateDetailsPanel(data) {
    ui.detailsPanel.classList.remove('hidden');

    const parts = data.id.split(/[:/]/);
    const title = parts[parts.length - 1];

    ui.detailTitle.innerHTML = title.replaceAll('_', '_<wbr>');

    const children = graphData.elements.filter(e => e.data.source === data.id);

    const parents = graphData.elements.filter(e => e.data.target === data.id);

    // Render lists
    renderList(ui.detailChildren, ui.detailChildCount, children, 'target', data.type === 'tag' ? 'Tags & Elements' : 'Elements');
    renderList(ui.detailParents, ui.detailParentCount, parents, 'source', 'Tags');

    // Render JSON
    if (data.json) {
        ui.jsonContent.innerHTML = formatJson(data.json);
    } else {
        ui.jsonContent.innerHTML = '<span class="text-muted">No JSON available</span>';
    }
}

function formatJson(json) {
    if (!json) return '';

    // Stringify with indentation
    let jsonStr = JSON.stringify(json, null, 2);

    // Escape HTML (basic)
    jsonStr = jsonStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Syntax Highlight
    return jsonStr.replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function (match) {
        let cls = 'json-number';
        if (/^"/.test(match)) {
            if (/:$/.test(match)) {
                cls = 'json-key';
            } else {
                cls = 'json-string';
            }
        } else if (/true|false/.test(match)) {
            cls = 'json-boolean';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }

        return `<span class="${cls}">${match}</span>`;
    });
}


function renderList(listEl, countEl, edges, targetKey, emptyLabel) {
    const isParentList = targetKey === 'source';

    if (edges.length === 0) {
        countEl.textContent = '';
        countEl.parentElement.style.display = 'none';

        if (countEl.parentElement) {
            const h4 = countEl.parentElement;
            const section = h4.parentElement;
            if (section) section.style.display = 'none';
        }
        return;
    } else {
        if (countEl.parentElement) {
            const h4 = countEl.parentElement;
            h4.style.display = 'block';
            const section = h4.parentElement;
            if (section) section.style.display = 'block';
        }
    }

    countEl.textContent = edges.length;

    listEl.innerHTML = edges.map(edge => {
        const id = edge.data[targetKey];
        const label = formatListLabel(id).replaceAll('_', '_<wbr>');
        return `<li data-id="${id}" title="${id}">${label}</li>`;
    }).join('');

    // Add click listeners
    listEl.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
            const id = li.getAttribute('data-id');
            // Navigate to it -> Open tab
            tabManager.openTab(id, id);
        });
    });
}

function formatListLabel(id) {
    if (!id) return '';
    // Split by : or / and take the last part
    const parts = id.split(/[:/]/);
    return parts[parts.length - 1];
}


if (ui.treeSearch) {
    ui.treeSearch.addEventListener('input', (e) => {
        const val = e.target.value;
        if (ui.searchClearBtn) {
            ui.searchClearBtn.classList.toggle('hidden', !val);
        }
        if (treeView) {
            treeView.setSearchTerm(val);
        }
    });

    if (ui.searchClearBtn) {
        ui.searchClearBtn.addEventListener('click', () => {
            ui.treeSearch.value = '';
            ui.searchClearBtn.classList.add('hidden');
            if (treeView) {
                treeView.setSearchTerm('');
            }
            ui.treeSearch.focus();
        });
    }
}


document.getElementById('refresh-btn').addEventListener('click', () => {
    if (graph) graph.reset();
});


document.getElementById('info-btn').addEventListener('click', () => {
    ui.aboutModal.classList.remove('hidden');
});


if (ui.aboutCloseBtn) {
    ui.aboutCloseBtn.addEventListener('click', () => {
        ui.aboutModal.classList.add('hidden');
    });
}


if (ui.aboutModal) {
    ui.aboutModal.addEventListener('click', (e) => {
        if (e.target === ui.aboutModal) {
            ui.aboutModal.classList.add('hidden');
        }
    });
}


document.addEventListener('keydown', (e) => {
    // Search focus: Alt + F or Option + F
    if (e.altKey && e.code === 'KeyF') {
        if (ui.treeSearch) {
            e.preventDefault();
            ui.treeSearch.focus();
            ui.treeSearch.select();
        }
    }

    // Switch tabs: Alt/Option + 1-9 (Tab index) or 0 (Last tab)
    if (e.altKey && e.code.startsWith('Digit')) {
        const digit = parseInt(e.key);
        if (!isNaN(digit)) {
            e.preventDefault();
            const tabs = tabManager.tabs;
            if (tabs.length === 0) return;

            let targetIndex;
            if (digit === 0) {
                targetIndex = tabs.length - 1; // 0 = last tab
            } else {
                targetIndex = digit - 1; // 1-indexed to 0-indexed
            }

            if (tabs[targetIndex]) {
                tabManager.activateTab(tabs[targetIndex].id);
            }
        }
    }

    // Close active tab: Alt + W or Option + W
    if (e.altKey && e.code === 'KeyW') {
        if (tabManager.activeTabId) {
            e.preventDefault();
            tabManager.closeTab(tabManager.activeTabId);
        }
    }

    if (e.key === 'Escape') {
        if (ui.aboutModal && !ui.aboutModal.classList.contains('hidden')) {
            ui.aboutModal.classList.add('hidden');
        }
    }
});


const disclaimerModal = document.getElementById('disclaimer-modal');
const disclaimerCloseBtn = document.getElementById('disclaimer-close-btn');

function checkDisclaimer() {
    const accepted = localStorage.getItem('disclaimerAccepted');
    if (!accepted) {
        if (disclaimerModal) disclaimerModal.classList.remove('hidden');
    } else {
        init();
    }
}

if (disclaimerCloseBtn) {
    disclaimerCloseBtn.addEventListener('click', () => {
        localStorage.setItem('disclaimerAccepted', 'true');
        if (disclaimerModal) disclaimerModal.classList.add('hidden');
        init();
    });
}


function updateShortcutLabels() {
    const isMac = navigator.userAgent.toUpperCase().indexOf('MAC') !== -1;
    const modifierText = isMac ? 'Option' : 'Alt';

    document.querySelectorAll('.kbd-modifier').forEach(el => {
        el.textContent = modifierText;
    });
}

updateShortcutLabels();
checkDisclaimer();
