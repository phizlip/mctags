import { MinecraftData } from './minecraft-data.js';
import { TagGraph } from './graph.js';
import { TreeView } from './tree-view.js';
import { DataPackManager } from './data-pack-manager.js';
import { VersionChecker } from './version-checker.js';

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
    aboutCloseBtn: document.getElementById('about-close-btn'),
    settingsModal: document.getElementById('settings-modal'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsCloseBtn: document.getElementById('settings-close-btn'),
    settingsSaveBtn: document.getElementById('settings-save-btn'),
    settingsResetBtn: document.getElementById('settings-reset-btn'),
    gridSpacingInput: document.getElementById('grid-spacing'),
    gridSpacingValue: document.getElementById('grid-spacing-value'),

    datapackDropZone: document.getElementById('datapack-drop-zone'),
    datapackFileInput: document.getElementById('datapack-file-input'),
    datapackList: document.getElementById('datapack-list'),
    datapackModalBody: document.getElementById('datapack-modal-body')
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
const dataPackManager = new DataPackManager();
let graph = null;
let treeView = null;
let graphData = null;
let baseGraphData = null; // Store base Minecraft data separately
let pendingNodeId = null;

function parseHash() {
    const hash = window.location.hash.substring(1);
    if (!hash) return { versionId: null, nodeId: null };

    const parts = hash.split('/');
    const versionId = parts[0];

    if (parts.length > 1) {
        const category = parts[1];
        const namespace = parts[2];
        const name = parts.slice(3).join('/');

        if (category && namespace && name) {
            return { versionId, nodeId: `${category}:${namespace}:${name}` };
        }
    }

    return { versionId, nodeId: null };
}

function updateUrl(nodeId) {
    const versionId = ui.versionSelect.options[ui.versionSelect.selectedIndex]?.text.split(' ')[0] || '1.13';

    if (!nodeId) {
        window.location.hash = `#${versionId}`;
        return;
    }

    const parts = nodeId.split(':');
    if (parts.length >= 3) {
        const category = parts[0];
        const namespace = parts[1];
        const name = parts.slice(2).join('/');
        window.location.hash = `#${versionId}/${category}/${namespace}/${name}`;
    } else {
        window.location.hash = `#${versionId}`;
    }
}


const tabManager = {
    tabs: [],
    activeTabId: null,
    dragSrcEl: null,

    init() {
        this.render();
        this.initDragDrop();
        ui.tabsBar.addEventListener('mousedown', (e) => {
            if (e.button === 1) {
                e.preventDefault();
            }
        });
        ui.tabsBar.addEventListener('wheel', (e) => {
            if (e.deltaY !== 0) {
                e.preventDefault();
                ui.tabsBar.scrollLeft += e.deltaY;
            }
        }, { passive: false });
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
        updateUrl(null);
    },

    activateTab(id) {
        this.activeTabId = id;
        this.render();

        // Update browser tab title to show short name
        document.title = id.split(/[:/]/).pop();

        updateUrl(id);

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
                 onauxclick="if(event.button === 1) { window.closeTab('${tab.id}', event); }">
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

    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    if (sidebarToggleBtn) {
        const collapseIcon = `<path d="M6.823 7.823a.25.25 0 0 1 0 .354l-2.396 2.396A.25.25 0 0 1 4 10.396V5.604a.25.25 0 0 1 .427-.177Z"/><path d="M1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25V1.75C0 .784.784 0 1.75 0ZM1.5 1.75v12.5c0 .138.112.25.25.25H9.5v-13H1.75a.25.25 0 0 0-.25.25ZM11 14.5h3.25a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25H11Z"/>`;
        const expandIcon = `<path d="m4.177 7.823 2.396-2.396A.25.25 0 0 1 7 5.604v4.792a.25.25 0 0 1-.427.177L4.177 8.177a.25.25 0 0 1 0-.354Z"/><path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0 1 14.25 16H1.75A1.75 1.75 0 0 1 0 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25H9.5v-13Zm12.5 13a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25H11v13Z"/>`;

        sidebarToggleBtn.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            resizer.classList.toggle('collapsed');

            const svg = sidebarToggleBtn.querySelector('svg');
            if (sidebar.classList.contains('collapsed')) {
                svg.innerHTML = collapseIcon;
                sidebarToggleBtn.title = "Expand Sidebar";
            } else {
                svg.innerHTML = expandIcon;
                sidebarToggleBtn.title = "Collapse Sidebar";
            }

            if (graph && graph.cy) graph.cy.resize();
        });
    }
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

        // Check hash for initial version
        const { versionId, nodeId } = parseHash();
        let targetVersion = null;

        if (versionId) {
            targetVersion = manifest.versions.find(v => v.id === versionId);
            if (targetVersion) {
                pendingNodeId = nodeId;
                const option = Array.from(ui.versionSelect.options).find(opt => opt.text === versionId);
                if (option) ui.versionSelect.value = option.value;
            }
        }

        if (!targetVersion) {
            targetVersion = manifest.versions.find(v => v.type === 'snapshot');
        }

        if (targetVersion) {
            loadVersion(targetVersion);
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
        dataPackManager.clear(); // Clear custom data packs on version change

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

        // Store base data and working copy
        baseGraphData = JSON.parse(JSON.stringify(extractedData)); // Deep clone
        graphData = extractedData;

        ui.loadingModal.classList.add('hidden');

        graph = new TagGraph('cy', onNodeSelect);
        graph.init(graphData.elements);
        if (typeof currentSettings !== 'undefined' && graph.updateSettings) {
            graph.updateSettings(currentSettings);
        }

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

        // Handle pending deep link
        if (pendingNodeId) {
            const exists = graphData.elements.some(el => el.data.id === pendingNodeId);

            if (exists) {
                tabManager.openTab(pendingNodeId, pendingNodeId);
            } else {
                console.warn(`Node ${pendingNodeId} not found in version ${version.id}`);
                updateUrl(null);
            }
            pendingNodeId = null;
        } else {
            updateUrl(null);
        }

    } catch (e) {
        ui.progressText.textContent = 'Error: ' + e.message;
        console.error(e);
    }
}

function rebuildGraphWithDataPacks() {
    if (!baseGraphData) {
        console.warn('Cannot rebuild graph: baseGraphData not initialized');
        return;
    }

    // Start with a fresh copy of base Minecraft data
    graphData = JSON.parse(JSON.stringify(baseGraphData));

    // Ensure pack format is preserved/accessible
    const expectedFormat = baseGraphData.packFormat;

    // Get enabled data packs
    const enabledPacks = dataPackManager.getEnabledDataPacks();

    if (enabledPacks.length === 0) {
        console.log('No enabled data packs, using base data only');
        refreshViews();
        return;
    }



    // Create a map of existing nodes for quick lookup
    const existingNodes = new Map();
    const existingEdges = new Set();

    graphData.elements.forEach(el => {
        if (el.data && el.data.id && !el.data.source) {
            existingNodes.set(el.data.id, el);
        } else if (el.data && el.data.source && el.data.target) {
            existingEdges.add(`${el.data.source}->${el.data.target}`);
        }
    });

    // Process each enabled data pack
    enabledPacks.forEach(pack => {
        const packColor = pack.color;

        pack.tags.forEach((tagData, tagId) => {
            // Add the tag node if it doesn't exist
            if (!existingNodes.has(tagId)) {
                const newNode = {
                    data: {
                        id: tagId,
                        label: tagData.name,
                        type: 'tag',
                        category: tagData.category,
                        path: tagData.path,
                        json: tagData.json,
                        dataPackId: pack.id,
                        dataPackColor: packColor
                    }
                };
                graphData.elements.push(newNode);
                existingNodes.set(tagId, newNode);
            } else {
                // Tag exists, mark it as also from this data pack
                const node = existingNodes.get(tagId);

                // If this is a new override, update the source pack info
                if (!node.data.dataPackId || tagData.replace) {
                    node.data.dataPackId = pack.id;
                    node.data.dataPackColor = packColor;
                }
            }

            // Handle "replace": true
            if (tagData.replace) {


                // Mark node as replaced for UI
                const node = existingNodes.get(tagId);
                if (node) {
                    node.data.replacedBy = pack.name;
                    node.data.replacedByColor = packColor;
                }

                // Remove attributes from base data (so it looks like a fresh override)
                // We keep the node itself, but clear its "json" if it was from base
                // actually, we should probably overwrite the JSON with the new one
                if (node) {
                    node.data.json = tagData.json;
                }

                // Remove all existing edges where this tag is the source
                // We need to filter graphData.elements IN PLACE or create a new array
                // Creating a new array is safer but we need to update existingEdges set too

                // 1. Identify edges to remove
                const edgesToRemove = [];
                graphData.elements.forEach((el, index) => {
                    if (el.data.source === tagId) {
                        edgesToRemove.push(index);
                        existingEdges.delete(el.data.id);
                    }
                });

                // 2. Remove them (in reverse order to preserve indices)
                for (let i = edgesToRemove.length - 1; i >= 0; i--) {
                    graphData.elements.splice(edgesToRemove[i], 1);
                }
            }

            // Add edges for tag values
            if (tagData.values && Array.isArray(tagData.values)) {
                tagData.values.forEach(val => {
                    let targetRaw = typeof val === 'object' ? val.id : val;

                    if (targetRaw.startsWith('#')) {
                        // Reference to another tag
                        const rawTag = targetRaw.substring(1);
                        const targetTagId = rawTag.includes(':') ? rawTag : 'minecraft:' + rawTag;
                        const targetId = `${tagData.category}:${targetTagId}`;

                        // Add target tag node if it doesn't exist
                        if (!existingNodes.has(targetId)) {
                            const newNode = {
                                data: {
                                    id: targetId,
                                    label: targetId.split(':').pop(),
                                    type: 'tag',
                                    category: tagData.category
                                }
                            };
                            graphData.elements.push(newNode);
                            existingNodes.set(targetId, newNode);
                        }

                        // Add edge
                        const edgeKey = `${tagId}->${targetId}`;
                        if (!existingEdges.has(edgeKey)) {
                            graphData.elements.push({
                                data: {
                                    source: tagId,
                                    target: targetId,
                                    id: edgeKey
                                }
                            });
                            existingEdges.add(edgeKey);
                        }
                    } else {
                        // Reference to an element
                        const rawElement = targetRaw.includes(':') ? targetRaw : 'minecraft:' + targetRaw;
                        const targetId = `${tagData.category}:${rawElement}`;



                        // Add element node if it doesn't exist
                        if (!existingNodes.has(targetId)) {

                            const newNode = {
                                data: {
                                    id: targetId,
                                    label: targetId.split(':').pop(),
                                    type: 'element',
                                    category: tagData.category
                                }
                            };
                            graphData.elements.push(newNode);
                            existingNodes.set(targetId, newNode);
                        } else {

                        }

                        // Add edge
                        const edgeKey = `${tagId}->${targetId}`;
                        if (!existingEdges.has(edgeKey)) {
                            graphData.elements.push({
                                data: {
                                    source: tagId,
                                    target: targetId,
                                    id: edgeKey
                                }
                            });
                            existingEdges.add(edgeKey);
                        }
                    }
                });
            }
        });
    });

    refreshViews();

}

function refreshViews() {
    // Refresh the graph and tree view
    if (graph) {
        graph.init(graphData.elements);
        if (typeof currentSettings !== 'undefined' && graph.updateSettings) {
            graph.updateSettings(currentSettings);
        }

        // Re-render current view if active
        if (tabManager.activeTabId) {
            graph.showFocusedSubgraph(tabManager.activeTabId);
        }
    }

    if (treeView) {
        treeView.init(graphData);
    }
}

window.addEventListener('hashchange', () => {
    const { versionId, nodeId } = parseHash();
    const currentVersionId = ui.versionSelect.options[ui.versionSelect.selectedIndex]?.text.split(' ')[0];

    if (versionId && versionId !== currentVersionId) {
        const option = Array.from(ui.versionSelect.options).find(opt => opt.text === versionId);
        if (option) {
            ui.versionSelect.value = option.value;
            ui.versionSelect.dispatchEvent(new Event('change'));
            pendingNodeId = nodeId;
        }
    } else if (nodeId) {
        if (tabManager.activeTabId !== nodeId) {
            const isOpen = tabManager.tabs.some(t => t.id === nodeId);
            if (isOpen) {
                tabManager.activateTab(nodeId);
            } else {
                if (graphData) {
                    const exists = graphData.elements.some(el => el.data.id === nodeId);
                    if (exists) {
                        tabManager.openTab(nodeId, nodeId);
                    }
                }
            }
        }
    }
});

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

    // Render Replaced Warning
    const warningContainer = document.getElementById('detail-replaced-warning');
    if (warningContainer) {
        if (data.replacedBy) {
            warningContainer.innerHTML = `
                <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid #f59e0b; border-radius: 6px; padding: 0.75rem; margin-bottom: 1rem; color: #f59e0b; font-size: 0.85rem; display: flex; align-items: start; gap: 0.5rem;">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="currentColor" style="flex-shrink: 0; margin-top: 2px;">
                        <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path>
                    </svg>
                    <div>
                        <strong>Replaced by Data Pack</strong>
                        <div style="margin-top: 2px; color: var(--text-secondary);">Modified by <span style="color: ${data.replacedByColor || '#fff'}">${data.replacedBy}</span></div>
                    </div>
                </div>
            `;
            warningContainer.classList.remove('hidden');
        } else {
            warningContainer.classList.add('hidden');
            warningContainer.innerHTML = '';
        }
    }


    renderList(ui.detailChildren, ui.detailChildCount, children, 'target', data.type === 'tag' ? 'Tags & Elements' : 'Elements');
    renderList(ui.detailParents, ui.detailParentCount, parents, 'source', 'Tags');


    if (data.json) {
        ui.jsonContent.innerHTML = formatJson(data.json);
    } else {
        ui.jsonContent.innerHTML = '<span class="text-muted">No JSON available</span>';
    }
}

function formatJson(json) {
    if (!json) return '';


    let jsonStr = JSON.stringify(json, null, 2);


    jsonStr = jsonStr.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');


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
    // Split by : only and take the last part
    const parts = id.split(':');
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
    if (e.key === 'Escape') {
        if (ui.aboutModal && !ui.aboutModal.classList.contains('hidden')) {
            ui.aboutModal.classList.add('hidden');
        }
        if (ui.settingsModal && !ui.settingsModal.classList.contains('hidden')) {
            ui.settingsModal.classList.add('hidden');
        }
        const datapackModal = document.getElementById('datapack-modal');
        if (datapackModal && !datapackModal.classList.contains('hidden')) {
            datapackModal.classList.add('hidden');
        }
        if (ui.treeSearch) {
            ui.treeSearch.blur();
        }
        return;
    }

    const activeTag = document.activeElement.tagName.toLowerCase();
    if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement.isContentEditable) {
        return;
    }

    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) {
        return;
    }

    if (e.code === 'KeyF') {
        if (ui.treeSearch) {
            e.preventDefault();
            ui.treeSearch.focus();
            ui.treeSearch.select();
        }
    }

    // Switch tabs: 1-9 (Tab index) or 0 (Last tab)
    if (e.code.startsWith('Digit')) {
        const digit = parseInt(e.code.replace('Digit', ''));
        if (!isNaN(digit)) {
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

    // Close active tab: W
    if (e.code === 'KeyW') {
        if (tabManager.activeTabId) {
            e.preventDefault();
            tabManager.closeTab(tabManager.activeTabId);
        }
    }

    // Toggle Sidebar: E
    if (e.code === 'KeyE') {
        e.preventDefault();
        const btn = document.getElementById('sidebar-toggle-btn');
        if (btn) btn.click();
    }

    // Reset View: R
    if (e.code === 'KeyR') {
        e.preventDefault();
        if (graph) graph.reset();
    }

    // Grid Spacing: - or +
    if (e.key === '-' || e.code === 'NumpadSubtract') {
        currentSettings.spacingFactor = Math.max(0.5, Math.min(3.0, (currentSettings.spacingFactor - 0.1)));
        currentSettings.spacingFactor = Math.round(currentSettings.spacingFactor * 10) / 10;
        saveAndApplySettings();
    }
    if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd') {
        currentSettings.spacingFactor = Math.max(0.5, Math.min(3.0, (currentSettings.spacingFactor + 0.1)));
        currentSettings.spacingFactor = Math.round(currentSettings.spacingFactor * 10) / 10;
        saveAndApplySettings();
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
    const controlText = isMac ? 'Cmd' : 'Ctrl';

    document.querySelectorAll('.kbd-modifier').forEach(el => {
        el.textContent = modifierText;
    });

    document.querySelectorAll('.kbd-ctrl').forEach(el => {
        el.textContent = controlText;
    });
}

const defaultSettings = {
    spacingFactor: 1.0
};
let currentSettings = { ...defaultSettings };

try {
    const saved = localStorage.getItem('mctags-settings');
    if (saved) {
        currentSettings = { ...defaultSettings, ...JSON.parse(saved) };
    }
} catch (e) { console.error('Failed to load settings', e); }

function updateSettingsUI() {
    if (ui.gridSpacingInput) {
        ui.gridSpacingInput.value = currentSettings.spacingFactor;
        ui.gridSpacingValue.textContent = currentSettings.spacingFactor;
    }
}

if (ui.settingsBtn) {
    ui.settingsBtn.addEventListener('click', () => {
        updateSettingsUI();
        ui.settingsModal.classList.remove('hidden');
    });
}

if (ui.settingsCloseBtn) {
    ui.settingsCloseBtn.addEventListener('click', () => {
        ui.settingsModal.classList.add('hidden');
    });
}

if (ui.settingsResetBtn) {
    ui.settingsResetBtn.addEventListener('click', () => {
        currentSettings = { ...defaultSettings };
        updateSettingsUI();
        saveAndApplySettings();
    });
}

function saveAndApplySettings() {
    localStorage.setItem('mctags-settings', JSON.stringify(currentSettings));

    if (graph && graph.updateSettings) {
        graph.updateSettings(currentSettings);
        // Re-render current view if active
        if (tabManager.activeTabId) {
            graph.showFocusedSubgraph(tabManager.activeTabId);
        }
    }
    updateSettingsUI();
}

if (ui.gridSpacingInput) {
    ui.gridSpacingInput.addEventListener('input', (e) => {
        ui.gridSpacingValue.textContent = e.target.value;
        currentSettings.spacingFactor = parseFloat(e.target.value);
        saveAndApplySettings();
    });
}

if (ui.settingsModal) {
    ui.settingsModal.addEventListener('click', (e) => {
        if (e.target === ui.settingsModal) {
            ui.settingsModal.classList.add('hidden');
        }
    });
}


updateShortcutLabels();
checkDisclaimer();

// Data Pack Management
function renderDataPackList() {
    if (!ui.datapackList) return;

    const packs = dataPackManager.getAllDataPacks();

    if (packs.length === 0) {
        ui.datapackList.innerHTML = '<p style="font-size: 0.875rem; color: var(--text-secondary); text-align: center; padding: 1rem 0;">No data packs loaded</p>';
        return;
    }

    ui.datapackList.innerHTML = packs.map(pack => {
        const tagCount = pack.tags.size;
        const tagText = tagCount === 1 ? 'tag' : 'tags';
        const hasError = pack.error !== null;


        // baseGraphData.packFormat comes from the downloaded vanilla JAR's version.json
        const expectedFormat = baseGraphData ? baseGraphData.packFormat : null;


        if (!hasError) {
            pack.versionWarning = VersionChecker.checkCompatibility(pack.packFormat, expectedFormat);
        }

        const hasVersionWarning = !hasError && pack.versionWarning &&
            pack.versionWarning !== VersionChecker.WARNING_LEVELS.COMPATIBLE;

        const warningMessage = hasVersionWarning ?
            VersionChecker.getWarningMessage(pack.versionWarning, pack.packFormat, expectedFormat) : null;

        const itemClass = `datapack-item ${hasError ? 'error' : ''} ${hasVersionWarning ? 'warning' : ''}`.trim();

        return `
        <div class="${itemClass}" data-id="${pack.id}">
            <input type="color" class="datapack-color-picker" value="${pack.color}" data-id="${pack.id}" title="Change color" ${hasError ? 'disabled' : ''}>
            <div class="datapack-info">
                <div class="datapack-name" title="${pack.name}">${pack.name}</div>
                <div class="datapack-meta">${hasError ? pack.error : `${tagCount} ${tagText}`}</div>
            </div>
            ${hasVersionWarning ? `
            <div class="tooltip-container" style="position: relative;">
                <button class="datapack-version-warning" data-id="${pack.id}" data-warning="${pack.versionWarning}" title="Version warning">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
                        <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"></path>
                    </svg>
                </button>
                <div class="datapack-version-tooltip" data-id="${pack.id}" style="display: none;">
                    <div class="version-tooltip-content">
                        <strong>${warningMessage.title}</strong>
                        <p style="white-space: pre-line;">${warningMessage.body}</p>
                        <a href="https://github.com/misode/mcmeta/tree/data-json" target="_blank" rel="noopener noreferrer" class="error-tooltip-link" style="margin-top: 0.5rem;">View Pack Format versions</a>
                    </div>
                </div>
            </div>
            ` : ''}
            ${hasError ? `
            <div class="tooltip-container" style="position: relative;">
                <button class="datapack-error-icon" data-id="${pack.id}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"></path>
                    </svg>
                </button>
                <div class="datapack-error-tooltip" data-id="${pack.id}" style="display: none;">
                    <div class="error-tooltip-content">
                        <strong>Upload Failed</strong>
                        <p>${pack.error}</p>
                        <p style="font-size: 0.75rem; margin-top: 0.5rem;">Data packs must contain tag files in <code>data/&lt;namespace&gt;/tags/&lt;category&gt;/</code>.</p>
                        <a href="https://minecraft.wiki/w/Tag_(Java_Edition)" target="_blank" rel="noopener noreferrer" class="error-tooltip-link">Learn more about tags</a>
                    </div>
                </div>
            </div>
            ` : `
            <label class="datapack-toggle">
                <input type="checkbox" ${pack.enabled ? 'checked' : ''} data-id="${pack.id}">
                <span class="datapack-toggle-slider"></span>
            </label>
            `}
<button class="datapack-remove" data-id="${pack.id}" title="Remove data pack">
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
        <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"></path>
    </svg>
</button>
        </div >
    `;
    }).join('');

    // Color picker handlers
    ui.datapackList.querySelectorAll('.datapack-color-picker').forEach(picker => {
        picker.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-id');
            const newColor = e.target.value;
            if (dataPackManager.updateColor(id, newColor)) {
                rebuildGraphWithDataPacks();
            }
        });
    });

    // Toggle handlers
    ui.datapackList.querySelectorAll('.datapack-toggle input').forEach(toggle => {
        toggle.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-id');
            dataPackManager.toggleDataPack(id);
            rebuildGraphWithDataPacks();
        });
    });

    // Remove handlers (no confirm dialog)
    ui.datapackList.querySelectorAll('.datapack-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.target.closest('button').getAttribute('data-id');
            dataPackManager.removeDataPack(id);
            renderDataPackList();
            rebuildGraphWithDataPacks();
        });
    });

    // Error info button handlers
    ui.datapackList.querySelectorAll('.datapack-error-icon').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = e.target.closest('button').getAttribute('data-id');
            const tooltip = ui.datapackList.querySelector(`.datapack-error-tooltip[data-id="${id}"]`);

            // Close all other tooltips
            ui.datapackList.querySelectorAll('.datapack-error-tooltip').forEach(t => {
                if (t !== tooltip) t.style.display = 'none';
            });

            // Toggle this tooltip
            tooltip.style.display = tooltip.style.display === 'none' ? 'block' : 'none';
        });
    });

    // Version warning button handlers
    ui.datapackList.querySelectorAll('.datapack-version-warning').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = e.target.closest('button').getAttribute('data-id');
            const tooltip = ui.datapackList.querySelector(`.datapack-version-tooltip[data-id="${id}"]`);

            // Close all other tooltips (both error and version)
            ui.datapackList.querySelectorAll('.datapack-error-tooltip, .datapack-version-tooltip').forEach(t => {
                if (t !== tooltip) t.style.display = 'none';
            });

            // Toggle this tooltip
            tooltip.style.display = tooltip.style.display === 'none' ? 'block' : 'none';
        });
    });
}

if (ui.datapackDropZone && ui.datapackFileInput) {
    // Click to browse
    ui.datapackDropZone.addEventListener('click', () => {
        ui.datapackFileInput.click();
    });

    // Drag and drop handlers
    ui.datapackModalBody.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        ui.datapackDropZone.classList.add('drag-over');
    });

    ui.datapackModalBody.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    ui.datapackModalBody.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        // Only remove if leaving the modal body itself
        if (e.target === ui.datapackModalBody) {
            ui.datapackDropZone.classList.remove('drag-over');
        }
    });

    ui.datapackModalBody.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        ui.datapackDropZone.classList.remove('drag-over');

        const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.zip'));
        if (files.length === 0) return;

        // Trigger the same upload logic as file input
        const dataTransfer = new DataTransfer();
        files.forEach(f => dataTransfer.items.add(f));
        ui.datapackFileInput.files = dataTransfer.files;
        ui.datapackFileInput.dispatchEvent(new Event('change'));
    });

    ui.datapackFileInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        for (const file of files) {
            ui.progressText.textContent = `Uploading ${file.name}...`;
            ui.loadingModal.classList.remove('hidden');

            const result = await dataPackManager.uploadDataPack(file);

            ui.loadingModal.classList.add('hidden');
            renderDataPackList();

            // Rebuild graph with data pack tags
            rebuildGraphWithDataPacks();

            // Handle both single pack and multiple packs (from nested ZIPs)
            const packCount = Array.isArray(result) ? result.length : 1;
            console.log(`Successfully uploaded ${packCount} data pack(s) from ${file.name} `);
        }

        e.target.value = '';
    });
}

// Data Pack Modal Handlers
const datapackModal = document.getElementById('datapack-modal');
const datapackBtn = document.getElementById('datapack-btn');
const datapackCloseBtn = document.getElementById('datapack-close-btn');

if (datapackBtn) {
    datapackBtn.addEventListener('click', () => {
        datapackModal.classList.remove('hidden');
        renderDataPackList();
    });
}

if (datapackCloseBtn) {
    datapackCloseBtn.addEventListener('click', () => {
        datapackModal.classList.add('hidden');
    });
}

if (datapackModal) {
    datapackModal.addEventListener('click', (e) => {
        if (e.target === datapackModal) {
            datapackModal.classList.add('hidden');
        }
    });
}
