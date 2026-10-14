# <img src="https://github.com/user-attachments/assets/ca81a7fe-7638-4dd8-b82c-777edb2320a8" width="25" height="25" alt="icon" /> [mctags.dev](https://mctags.dev)

A web-based tool for visualizing the hierarchy of Minecraft's data.

**Note:** This project is not affiliated with Mojang or Microsoft in any way. It does NOT redistribute any Minecraft code or resources. The Minecraft JAR is downloaded directly from Mojang's servers to your browser.

<img width="1920" height="1080" alt="mctags showing a tag graph and its JSON" src="https://github.com/user-attachments/assets/d0e588ee-c499-4915-84aa-7224bf4c77b6" />

## Working locally

This project consists of static files in `public/`, so any local web server will work. For example, with Python:

```sh
cd ~
git clone https://github.com/phizlip/mctags.git
cd mctags
python3 -m http.server 8000 --bind 127.0.0.1 --directory public
```

Open [localhost:8000](http://localhost:8000) and refresh after making changes.

## Credits

- [Cytoscape.js](https://js.cytoscape.org/) for the graphs, with [Dagre](https://github.com/dagrejs/dagre) and [fCoSE](https://github.com/iVis-at-Bilkent/cytoscape.js-fcose) for layout.
- [JSZip](https://stuk.github.io/jszip/) for reading JARs and data packs.
- [Octicons](https://primer.style/octicons/) for the icons.
- Inspired by [mcsrc.dev](https://github.com/FabricMC/mcsrc).
