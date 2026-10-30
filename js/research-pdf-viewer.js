import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/build/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/build/pdf.worker.min.mjs";

const viewer = document.querySelector("[data-pdf-viewer]");
const statusElement = document.querySelector("[data-pdf-status]");
const ipElements = document.querySelectorAll("[data-ip-label]");

if (!viewer || !statusElement) {
    throw new Error("PDF viewer container is missing.");
}

const pdfUrl = viewer.dataset.pdf;
const documentTitle = viewer.dataset.title || "研究资料";
let visitorIp = "IP 获取失败";

async function loadVisitorIp() {
    const endpoints = [
        "https://api64.ipify.org?format=json",
        "https://api.ipify.org?format=json",
    ];
    for (const endpoint of endpoints) {
        try {
            const response = await fetch(endpoint, { cache: "no-store" });
            if (!response.ok) continue;
            const payload = await response.json();
            if (typeof payload.ip === "string" && payload.ip.trim()) {
                return payload.ip.trim();
            }
        } catch (_) {
            // Try the next endpoint.
        }
    }
    return "IP 获取失败";
}

function updateIpLabels() {
    ipElements.forEach((element) => {
        element.textContent = visitorIp;
    });
}

function drawWatermark(context, canvas) {
    const text = `仅供在线阅读  ${visitorIp}`;
    const fontSize = Math.max(18, Math.round(canvas.width / 52));
    const gapX = Math.max(240, Math.round(canvas.width / 3.1));
    const gapY = Math.max(150, Math.round(canvas.height / 4.2));
    context.save();
    context.globalAlpha = 0.18;
    context.fillStyle = "#173f5f";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `600 ${fontSize}px "Microsoft YaHei", sans-serif`;
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(-Math.PI / 7);
    for (let y = -canvas.height; y <= canvas.height; y += gapY) {
        for (let x = -canvas.width; x <= canvas.width; x += gapX) {
            context.fillText(text, x, y);
        }
    }
    context.restore();
}

async function renderPage(pdf, pageNumber, pageContainer) {
    if (pageContainer.dataset.rendered === "true") return;
    pageContainer.dataset.rendered = "true";

    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const targetWidth = Math.min(1600, Math.max(960, pageContainer.clientWidth * 1.5));
    const scale = targetWidth / baseViewport.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);

    await page.render({ canvasContext: context, viewport }).promise;
    drawWatermark(context, canvas);
    pageContainer.replaceChildren(canvas);

    const label = document.createElement("span");
    label.className = "pdf-page-label";
    label.textContent = `${pageNumber} / ${pdf.numPages}`;
    pageContainer.appendChild(label);
    page.cleanup();
}

function createPageShell(pageNumber) {
    const shell = document.createElement("section");
    shell.className = "pdf-page";
    shell.dataset.pageNumber = String(pageNumber);
    const placeholder = document.createElement("div");
    placeholder.className = "pdf-placeholder";
    placeholder.textContent = `第 ${pageNumber} 页等待加载`;
    shell.appendChild(placeholder);
    return shell;
}

async function initializeViewer() {
    visitorIp = await loadVisitorIp();
    updateIpLabels();
    statusElement.textContent = "正在载入 PDF…";

    const loadingTask = pdfjsLib.getDocument({
        url: pdfUrl,
        disableAutoFetch: false,
        disableStream: false,
        disableRange: false,
        stopAtErrors: false,
    });
    const pdf = await loadingTask.promise;
    statusElement.textContent = `${pdf.numPages} 页 · IP 水印 ${visitorIp}`;

    const fragment = document.createDocumentFragment();
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        fragment.appendChild(createPageShell(pageNumber));
    }
    viewer.replaceChildren(fragment);

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                const pageContainer = entry.target;
                const pageNumber = Number(pageContainer.dataset.pageNumber);
                observer.unobserve(pageContainer);
                renderPage(pdf, pageNumber, pageContainer).catch((error) => {
                    pageContainer.dataset.rendered = "error";
                    pageContainer.innerHTML = `<div class="pdf-error">第 ${pageNumber} 页加载失败，请刷新后重试。</div>`;
                    console.error(error);
                });
            });
        },
        { rootMargin: "900px 0px" },
    );

    viewer.querySelectorAll(".pdf-page").forEach((page) => observer.observe(page));
}

viewer.addEventListener("contextmenu", (event) => event.preventDefault());
viewer.addEventListener("dragstart", (event) => event.preventDefault());
document.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && (key === "s" || key === "p")) {
        event.preventDefault();
    }
});

initializeViewer().catch((error) => {
    statusElement.textContent = "PDF 加载失败";
    viewer.innerHTML = `<div class="pdf-error">${documentTitle}暂时无法载入，请稍后刷新页面。</div>`;
    console.error(error);
});
