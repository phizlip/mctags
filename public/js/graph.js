import cytoscape from 'cytoscape';
import fcose from 'cytoscape-fcose';
import dagre from 'cytoscape-dagre';

cytoscape.use(fcose);
cytoscape.use(dagre);

export class TagGraph {
    constructor(containerId, onNodeSelect) {
        this.container = document.getElementById(containerId);
        this.onNodeSelect = onNodeSelect;
        this.cy = null;
        this.currentLayout = 'fcose';
        this.allElements = [];
    }

    init(elements) {
        this.allElements = elements;

        this.cy = cytoscape({
            container: this.container,
            elements: [],

            style: [
                {
                    selector: 'node',
                    style: {
                        'label': 'data(label)',
                        'color': '#a1a1aa',
                        'font-size': 10,
                        'font-family': 'JetBrains Mono',
                        'text-valign': 'center',
                        'text-halign': 'center',
                        'width': 'label',
                        'height': 24,
                        'shape': 'rectangle',
                        'padding': '12px',
                        'background-color': '#52525b',
                        'min-width': '80px'
                    }
                },
                {
                    selector: 'node[type="tag"]',
                    style: {
                        'background-color': '#e4e4e7',
                        'width': 'label',
                        'min-width': '80px',
                        'height': 28,
                        'padding': '10px',
                        'font-weight': 'bold',
                        'color': '#18181b'
                    }
                },
                {
                    selector: 'node[type="tag"]:selected',
                    style: {
                        'background-color': '#ffffff',
                        'border-width': 2,
                        'border-color': '#a1a1aa'
                    }
                },
                {
                    selector: 'node:selected',
                    style: {
                        'background-color': '#ffffff',
                        'color': '#18181b'
                    }
                },
                {
                    selector: 'edge',
                    style: {
                        'width': 1,
                        'line-color': '#3f3f46',
                        'curve-style': 'bezier',
                        'target-arrow-shape': 'triangle',
                        'target-arrow-color': '#3f3f46'
                    }
                }
            ],

            layout: {
                name: 'fcose',
                quality: 'default',
                randomize: false,
                animate: false,
                nodeDimensionsIncludeLabels: true,
                numIter: 2000,
                tile: true,
                initialEnergyOnIncremental: 0.3,
                nodeRepulsion: 15000,
                idealEdgeLength: 150,
                edgeElasticity: 0.1
            },

            minZoom: 0.1,
            maxZoom: 5,
            wheelSensitivity: 0.2
        });

        this.registerEvents();
    }

    registerEvents() {
        this.cy.on('tap', 'node', (evt) => {
            const node = evt.target;
            this.onNodeSelect(node.data());
        });


        this.cy.on('tap', 'node', (evt) => {
            if (evt.originalEvent && evt.originalEvent.button === 1) {
                if (this.onNodeMiddleClick) {
                    this.onNodeMiddleClick(node.data('id'));
                }
            }
        });
        this.cy.on('mousedown', 'node', (evt) => {
            if (evt.originalEvent.button === 1) {
                evt.originalEvent.preventDefault();
                if (this.onNodeMiddleClick) {
                    this.onNodeMiddleClick(evt.target.data('id'));
                }
            }
        });

        this.cy.on('dbltap', 'node', (evt) => {
            const node = evt.target;
            if (this.onNodeDoubleClick) {
                this.onNodeDoubleClick(node.data('id'));
            }
        });

        this.cy.on('tap', (evt) => {
            if (evt.target === this.cy) {
                this.onNodeSelect(null);
            }
        });
    }

    highlight(id) {
        const node = this.cy.$id(id);
        if (node.nonempty()) {
            this.cy.animate({
                zoom: 2,
                center: { ele: node },
                duration: 500
            });
            node.select();
        }
    }

    updateFilters(activeTypes) {
        if (!this.cy) return;

        this.cy.nodes().style('display', 'element');
        this.cy.edges().style('display', 'element');

        this.cy.nodes().forEach(node => {
            const nodeType = node.data('type');
            const nodeCategory = node.data('category');

            let shouldShow = false;

            if (nodeType === 'tag' && activeTypes.includes('tag')) {
                shouldShow = true;
            } else if (nodeType === 'element' && activeTypes.includes(nodeCategory)) {
                shouldShow = true;
            }

            node.style('display', shouldShow ? 'element' : 'none');
        });
    }

    changeLayout(layoutType) {
        if (!this.cy) return;

        this.currentLayout = layoutType;

        const layouts = {
            fcose: {
                name: 'fcose',
                quality: 'default',
                randomize: false,
                animate: false,
                nodeDimensionsIncludeLabels: true,
                numIter: 2000,
                nodeRepulsion: 15000,
                idealEdgeLength: 150,
                edgeElasticity: 0.1
            },
            dagre: {
                name: 'dagre',
                rankDir: 'TB',
                nodeSep: 80,
                rankSep: 150,
                ranker: 'network-simplex',
                animate: false
            }
        };

        this.cy.layout(layouts[layoutType] || layouts.fcose).run();
    }

    reset() {
        this.cy.fit(50);
    }

    showFocusedSubgraph(tagId) {
        if (!this.cy) return;

        const centerNode = this.allElements.find(el =>
            el.data && el.data.id === tagId
        );

        if (!centerNode) {
            console.warn('Tag not found:', tagId);
            return;
        }

        const childEdges = this.allElements.filter(el =>
            el.data && el.data.source === tagId
        );
        childEdges.sort((a, b) => a.data.target.localeCompare(b.data.target));

        const childNodeIds = childEdges.map(e => e.data.target);
        const childNodes = this.allElements.filter(el =>
            el.data && childNodeIds.includes(el.data.id)
        );

        const parentEdges = this.allElements.filter(el =>
            el.data && el.data.target === tagId
        );
        const parentNodeIds = parentEdges.map(e => e.data.source);
        const parentNodes = this.allElements.filter(el =>
            el.data && parentNodeIds.includes(el.data.id)
        );

        const subgraphElements = [
            centerNode,
            ...parentNodes,
            ...childNodes,
            ...parentEdges,
            ...childEdges
        ].filter(Boolean);

        this.cy.elements().remove();
        this.cy.add(subgraphElements);

        // Calculate max label lengths separately for parents and children
        let maxParentLabelLen = 0;
        parentNodes.forEach(p => {
            const len = (p.data && p.data.label) ? p.data.label.length : 0;
            if (len > maxParentLabelLen) maxParentLabelLen = len;
        });

        let maxChildLabelLen = 0;
        childNodes.forEach(c => {
            const len = (c.data && c.data.label) ? c.data.label.length : 0;
            if (len > maxChildLabelLen) maxChildLabelLen = len;
        });

        // Use localized spacing based on labels in that specific group
        const parentSpacingX = Math.max(160, (maxParentLabelLen * 8) + 48);
        const childSpacingX = Math.max(120, (maxChildLabelLen * 8) + 40);
        const spacingY = 120;

        const centerPos = { x: 0, y: 0 };
        this.cy.$id(tagId).position(centerPos);

        const parentCount = parentNodes.length;
        if (parentCount > 0) {
            // Parental grid: use a more vertical ratio if labels are long to prevent horizontal sprawl
            const aspectPreference = maxParentLabelLen > 20 ? 0.8 : 1.5;
            const cols = Math.max(1, Math.ceil(Math.sqrt(parentCount * aspectPreference)));

            parentNodes.forEach((pData, index) => {
                const node = this.cy.$id(pData.data.id);

                const row = Math.floor(index / cols);
                const col = index % cols;

                const itemsInThisRow = Math.min(cols, parentCount - (row * cols));
                const rowWidth = (itemsInThisRow - 1) * parentSpacingX;
                const rowStartX = -rowWidth / 2;

                node.position({
                    x: rowStartX + (col * parentSpacingX),
                    y: -spacingY - (row * spacingY) // Grow upwards
                });
            });
        }

        const childCount = childNodes.length;
        if (childCount > 0) {
            // Children grid: standard horizontal preference (3:2 ratio)
            const cols = Math.max(1, Math.ceil(Math.sqrt(childCount * 1.5)));

            childNodes.forEach((cData, index) => {
                const node = this.cy.$id(cData.data.id);

                const row = Math.floor(index / cols);
                const col = index % cols;

                const itemsInThisRow = Math.min(cols, childCount - (row * cols));
                const rowWidth = (itemsInThisRow - 1) * childSpacingX;
                const rowStartX = -rowWidth / 2;

                node.position({
                    x: rowStartX + (col * childSpacingX),
                    y: spacingY + (row * spacingY)
                });
            });
        }
        const layout = this.cy.layout({
            name: 'preset',
            animate: true,
            animationDuration: 500,
            animationEasing: 'ease-in-out-cubic',
            fit: true,
            padding: 50
        });

        layout.run();

        this.cy.$id(tagId).style({
            'border-width': 3,
            'border-color': '#ffffff'
        });
    }

    showEmptyState() {
        if (!this.cy) return;
        this.cy.elements().remove();
    }
}
