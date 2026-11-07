(() => {
  const PDFJS_VERSION = "3.11.174";
  const PAGE_FLIP_VERSION = "2.0.7";
  const shelf = document.querySelector(".book-shelf");

  if (!shelf) return;

  const scriptUrl = document.currentScript?.src || window.location.href;
  const catalogUrl = new URL(shelf.dataset.catalog || "catalog.json", scriptUrl);
  const pdfDocuments = new Map();
  let pdfjsPromise;
  let pageFlipPromise;
  let activeReader;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Gagal memuat pustaka: ${src}`));
      document.head.append(script);
    });
  }

  function loadPdfJs() {
    if (!pdfjsPromise) {
      pdfjsPromise = loadScript(
        `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`,
      ).then(() => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
        return window.pdfjsLib;
      });
    }
    return pdfjsPromise;
  }

  function loadPageFlip() {
    if (!pageFlipPromise) {
      pageFlipPromise = loadScript(
        `https://cdn.jsdelivr.net/npm/page-flip@${PAGE_FLIP_VERSION}/dist/js/page-flip.browser.js`,
      ).then(() => window.St.PageFlip);
    }
    return pageFlipPromise;
  }

  function encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function bookUrl(book) {
    return new URL(encodePath(book.path), catalogUrl).href;
  }

  function getPdf(book) {
    const url = bookUrl(book);
    if (!pdfDocuments.has(url)) {
      pdfDocuments.set(
        url,
        loadPdfJs().then((pdfjs) => pdfjs.getDocument(url).promise),
      );
    }
    return pdfDocuments.get(url);
  }

  function setMessage(parent, text, className = "book-message") {
    const message = document.createElement("p");
    message.className = className;
    message.textContent = text;
    parent.replaceChildren(message);
  }

  function createBookCard(book) {
    const card = document.createElement("article");
    card.className = "book-card";

    const openButton = document.createElement("button");
    openButton.className = "book-card-open";
    openButton.type = "button";
    openButton.setAttribute("aria-label", `Buka buku ${book.title}`);

    const cover = document.createElement("span");
    cover.className = "book-cover";
    cover.setAttribute("aria-hidden", "true");
    const canvas = document.createElement("canvas");
    cover.append(canvas);

    const title = document.createElement("span");
    title.className = "book-card-title";
    title.textContent = book.title;
    openButton.append(cover, title);
    openButton.addEventListener("click", () => openReader(book));

    const hint = document.createElement("span");
    hint.className = "book-card-hint";
    hint.textContent = "Buka buku";

    card.append(openButton, hint);
    renderCover(book, canvas, cover);
    return card;
  }

  async function renderCover(book, canvas, cover) {
    try {
      const pdf = await getPdf(book);
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(cover.clientWidth / viewport.width, 1);
      const scaledViewport = page.getViewport({ scale: Math.max(scale, 0.25) });
      canvas.width = Math.ceil(scaledViewport.width);
      canvas.height = Math.ceil(scaledViewport.height);
      await page.render({
        canvasContext: canvas.getContext("2d"),
        viewport: scaledViewport,
      }).promise;
    } catch (error) {
      cover.classList.add("book-cover-unavailable");
      cover.textContent = "PDF";
      console.error(`Sampul buku "${book.title}" tidak dapat dimuat.`, error);
    }
  }

  function createReader(book) {
    const dialog = document.createElement("dialog");
    dialog.className = "book-reader";
    dialog.setAttribute("aria-labelledby", "book-reader-title");

    const readerContent = document.createElement("div");
    readerContent.className = "book-reader-content";

    const header = document.createElement("header");
    header.className = "book-reader-header";
    const title = document.createElement("h2");
    title.id = "book-reader-title";
    title.textContent = book.title;

    const closeButton = document.createElement("button");
    closeButton.className = "book-reader-close";
    closeButton.type = "button";
    closeButton.textContent = "Tutup";
    closeButton.addEventListener("click", () => dialog.close());

    const fullscreenButton = document.createElement("button");
    fullscreenButton.className = "book-reader-fullscreen";
    fullscreenButton.type = "button";
    fullscreenButton.textContent = "Layar penuh";
    fullscreenButton.setAttribute("aria-label", "Aktifkan layar penuh");
    fullscreenButton.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement === readerContent) {
          await document.exitFullscreen();
        } else if (readerContent.requestFullscreen) {
          await readerContent.requestFullscreen();
        } else {
          throw new Error("Mode layar penuh tidak didukung browser ini.");
        }
      } catch (error) {
        status.hidden = false;
        status.textContent = "Mode layar penuh tidak dapat digunakan di browser ini.";
        status.classList.add("book-reader-error");
        console.error("Gagal mengaktifkan layar penuh.", error);
      }
    });

    const updateFullscreenButton = () => {
      const isFullscreen = document.fullscreenElement === readerContent;
      fullscreenButton.textContent = isFullscreen ? "Keluar layar penuh" : "Layar penuh";
      fullscreenButton.setAttribute(
        "aria-label",
        isFullscreen ? "Keluar dari layar penuh" : "Aktifkan layar penuh",
      );
    };
    document.addEventListener("fullscreenchange", updateFullscreenButton);
    header.append(title, fullscreenButton, closeButton);

    const status = document.createElement("p");
    status.className = "book-reader-status";
    status.setAttribute("role", "status");
    status.textContent = "Menyiapkan buku…";

    const stage = document.createElement("div");
    stage.className = "book-reader-stage";
    const viewport = document.createElement("div");
    viewport.className = "book-reader-viewport";
    viewport.append(stage);

    const controls = document.createElement("nav");
    controls.className = "book-reader-controls";
    controls.setAttribute("aria-label", "Navigasi halaman buku");
    const previous = document.createElement("button");
    previous.type = "button";
    previous.textContent = "Halaman sebelumnya";
    previous.disabled = true;
    const pageCount = document.createElement("span");
    pageCount.className = "book-page-count";
    pageCount.textContent = "—";
    const next = document.createElement("button");
    next.type = "button";
    next.textContent = "Halaman berikutnya";
    next.disabled = true;

    const zoomOut = document.createElement("button");
    zoomOut.type = "button";
    zoomOut.textContent = "−";
    zoomOut.setAttribute("aria-label", "Perkecil tampilan buku");
    const zoomLevel = document.createElement("span");
    zoomLevel.className = "book-zoom-level";
    zoomLevel.textContent = "100%";
    const zoomIn = document.createElement("button");
    zoomIn.type = "button";
    zoomIn.textContent = "+";
    zoomIn.setAttribute("aria-label", "Perbesar tampilan buku");
    controls.append(previous, pageCount, next, zoomOut, zoomLevel, zoomIn);

    readerContent.append(header, status, viewport, controls);
    dialog.append(readerContent);
    dialog.addEventListener("close", () => {
      document.removeEventListener("fullscreenchange", updateFullscreenButton);
      if (document.fullscreenElement === readerContent) {
        document.exitFullscreen().catch((error) => {
          console.error("Gagal keluar dari layar penuh saat menutup buku.", error);
        });
      }
      activeReader?.destroy();
      activeReader = undefined;
      dialog.remove();
    });

    previous.addEventListener("click", () => activeReader?.flipPrev());
    next.addEventListener("click", () => activeReader?.flipNext());

    let zoom = 1;
    const updateZoom = (change) => {
      zoom = Math.min(2, Math.max(0.75, zoom + change));
      zoomLevel.textContent = `${Math.round(zoom * 100)}%`;
      const flipbook = stage.firstElementChild;
      if (flipbook) {
        flipbook.style.transform = `scale(${zoom})`;
        flipbook.style.transformOrigin = "top center";
      }
      zoomOut.disabled = zoom <= 0.75;
      zoomIn.disabled = zoom >= 2;
    };
    zoomOut.addEventListener("click", () => updateZoom(-0.25));
    zoomIn.addEventListener("click", () => updateZoom(0.25));

    return { dialog, stage, status, previous, next, pageCount, updateZoom };
  }

  async function renderPage(pdf, pageNumber, pageElement) {
    const pageContainer = pageElement.querySelector(".book-page-content");
    if (pageElement.dataset.rendered === "true") return;
    pageElement.dataset.rendered = "loading";

    try {
      const page = await pdf.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const maxWidth = 540;
      const maxHeight = 760;
      const scale = Math.min(maxWidth / baseViewport.width, maxHeight / baseViewport.height);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.setAttribute("aria-label", `Halaman ${pageNumber}`);
      pageContainer.replaceChildren(canvas);
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
      pageElement.dataset.rendered = "true";
    } catch (error) {
      pageElement.dataset.rendered = "error";
      pageContainer.textContent = `Halaman ${pageNumber} tidak dapat ditampilkan.`;
      console.error(`Gagal merender halaman ${pageNumber}.`, error);
    }
  }

  async function openReader(book) {
    if (activeReader) return;

    const reader = createReader(book);
    shelf.append(reader.dialog);
    reader.dialog.showModal();

    try {
      const [pdf, PageFlip] = await Promise.all([getPdf(book), loadPageFlip()]);
      if (!reader.dialog.isConnected) return;

      const pages = Array.from({ length: pdf.numPages }, (_, index) => {
        const page = document.createElement("div");
        page.className = "book-page";
        const content = document.createElement("div");
        content.className = "book-page-content";
        content.textContent = "Memuat halaman…";
        const number = document.createElement("span");
        number.className = "book-page-number";
        number.textContent = String(index + 1);
        page.append(content, number);
        return page;
      });

      const flip = new PageFlip(reader.stage, {
        width: 540,
        height: 760,
        size: "stretch",
        minWidth: 280,
        maxWidth: 1080,
        minHeight: 390,
        maxHeight: 1520,
        maxShadowOpacity: 0.35,
        showCover: true,
        mobileScrollSupport: false,
        flippingTime: 800,
        usePortrait: true,
        drawShadow: true,
      });

      flip.loadFromHTML(pages);
      activeReader = flip;
      reader.updateZoom(0);

      const updatePage = () => {
        const current = flip.getCurrentPageIndex();
        reader.pageCount.textContent = `Halaman ${current + 1} dari ${pdf.numPages}`;
        reader.previous.disabled = current === 0;
        reader.next.disabled = current >= pdf.numPages - 1;
        pages.forEach((page, index) => {
          if (Math.abs(index - current) <= 2) {
            renderPage(pdf, index + 1, page);
          } else if (page.dataset.rendered === "true") {
            page.querySelector(".book-page-content").replaceChildren();
            page.dataset.rendered = "false";
          }
        });
      };

      flip.on("flip", updatePage);
      updatePage();
      reader.status.textContent = "";
      reader.status.hidden = true;
    } catch (error) {
      reader.status.textContent =
        "Buku tidak dapat dibuka. Periksa file PDF dan koneksi internet, lalu coba lagi.";
      reader.status.classList.add("book-reader-error");
      console.error(`Gagal membuka buku "${book.title}".`, error);
    }
  }

  async function loadShelf() {
    try {
      const response = await fetch(catalogUrl);
      if (!response.ok) throw new Error(`Katalog buku merespons ${response.status}.`);
      const books = await response.json();

      if (!Array.isArray(books) || books.length === 0) {
        setMessage(
          shelf,
          "Belum ada buku. Tambahkan file PDF ke folder books/pdfs/, lalu jalankan quarto render.",
        );
        return;
      }

      const grid = document.createElement("div");
      grid.className = "book-shelf-grid";
      books.forEach((book) => grid.append(createBookCard(book)));
      shelf.replaceChildren(grid);
    } catch (error) {
      setMessage(shelf, "Koleksi buku gagal dimuat. Coba render ulang situs Quarto.");
      console.error("Katalog buku gagal dimuat.", error);
    }
  }

  document.addEventListener("keydown", (event) => {
    if (!activeReader || !shelf.querySelector(".book-reader[open]")) return;
    if (event.key === "ArrowRight") activeReader.flipNext();
    if (event.key === "ArrowLeft") activeReader.flipPrev();
  });

  loadShelf();
})();
