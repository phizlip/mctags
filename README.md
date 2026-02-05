# [mctags.dev](https://mctags.dev)

A web-based tool for visualizing the hierarchy of Minecraft's data.

**Note:** This project is not affiliated with Mojang or Microsoft in any way. It does NOT redistribute any Minecraft code or resources. The Minecraft JAR is downloaded directly from Mojang's servers to your browser.

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/23ed6523-6520-4e2a-88a0-cc33d22287b8" />

## Build instructions

1.  **Install dependencies**
    ```bash
    npm install
    ```

2.  **Run the web app**
    ```bash
    npm start
    ```
    This will serve the app at `http://localhost:3000`.

## Features

-   **Tree View**: Browse the full folder structure of the data.
-   **Relational View**: View the relationships between tags and resources.
-   **JSON View**: View the JSON content of tags and resources.
-   **Search**: Instantly filter tags and resources.

## Credits

-   **Graph visualization**: [Cytoscape.js](https://js.cytoscape.org/)
-   **Layout**: [Dagre](https://github.com/dagrejs/dagre) / [fCoSE](https://github.com/iVis-at-Bilkent/cytoscape.js-fcose)
-   **JAR extraction**: [JSZip](https://stuk.github.io/jszip/)
-   **Icons**: [Octicons](https://primer.style/octicons/)
-   **Inspired by**: [mcsrc.dev](https://mcsrc.dev)
