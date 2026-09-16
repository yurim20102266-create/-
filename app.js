const $ = (id) => document.getElementById(id);

const canvas = $("cardCanvas");
const ctx = canvas.getContext("2d");
const statusText = $("status");

const STORAGE_KEY = "card_studio_templates_v1";
const sizes = {
  square: [1080, 1080],
  portrait: [1080, 1350],
  landscape: [1280, 720],
};

let currentImage = null;
let imageData = "";
let imageTask = 0;
let templates = [];

function say(message) {
  statusText.textContent = message;
}

function getSettings() {
  return {
    text: $("textInput").value,
    ratio: $("ratioSelect").value,
    fontSize: Number($("fontSizeInput").value),
    textColor: $("textColorInput").value,
    bgColor: $("bgColorInput").value,
    position: $("textPositionSelect").value,
  };
}

function validSettings(settings) {
  return (
    settings &&
    typeof settings.text === "string" &&
    settings.text.length <= 200 &&
    Object.hasOwn(sizes, settings.ratio) &&
    Number.isInteger(settings.fontSize) &&
    settings.fontSize >= 20 &&
    settings.fontSize <= 100 &&
    /^#[0-9a-f]{6}$/i.test(settings.textColor) &&
    /^#[0-9a-f]{6}$/i.test(settings.bgColor) &&
    ["top", "center", "bottom"].includes(settings.position)
  );
}

function applySettings(settings) {
  $("textInput").value = settings.text;
  $("ratioSelect").value = settings.ratio;
  $("fontSizeInput").value = settings.fontSize;
  $("textColorInput").value = settings.textColor;
  $("bgColorInput").value = settings.bgColor;
  $("textPositionSelect").value = settings.position;
}

function wrapText(text, maxWidth) {
  const lines = [];

  for (const paragraph of text.split("\n")) {
    let line = "";

    for (const character of Array.from(paragraph)) {
      const next = line + character;

      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = character;
      } else {
        line = next;
      }
    }

    lines.push(line);
  }

  return lines;
}

function draw() {
  const settings = getSettings();
  const [width, height] = sizes[settings.ratio];

  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = settings.bgColor;
  ctx.fillRect(0, 0, width, height);

  if (currentImage) {
    const scale = Math.min(
      width / currentImage.naturalWidth,
      height / currentImage.naturalHeight
    );

    const imageWidth = currentImage.naturalWidth * scale;
    const imageHeight = currentImage.naturalHeight * scale;

    ctx.drawImage(
      currentImage,
      (width - imageWidth) / 2,
      (height - imageHeight) / 2,
      imageWidth,
      imageHeight
    );
  }

  if (!settings.text.trim()) return;

  const margin = 60;
  const maxWidth = width - margin * 2;
  const maxHeight = height - margin * 2;

  let fontSize = settings.fontSize;
  let lines;
  let lineHeight;

  // 긴 문구는 자동 줄바꿈하고, 필요하면 글자를 줄입니다.
  do {
    ctx.font = `bold ${fontSize}px "맑은 고딕", sans-serif`;
    lines = wrapText(settings.text, maxWidth);
    lineHeight = fontSize * 1.4;

    if (lines.length * lineHeight <= maxHeight || fontSize <= 8) {
      break;
    }

    fontSize -= 1;
  } while (true);

  const totalHeight = lines.length * lineHeight;
  let top = (height - totalHeight) / 2;

  if (settings.position === "top") top = margin;
  if (settings.position === "bottom") {
    top = height - margin - totalHeight;
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(margin, margin, maxWidth, maxHeight);
  ctx.clip();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = settings.textColor;
  ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
  ctx.lineWidth = Math.max(2, fontSize / 14);
  ctx.lineJoin = "round";

  lines.forEach((line, index) => {
    const y = top + lineHeight * (index + 0.5);
    ctx.strokeText(line, width / 2, y, maxWidth);
    ctx.fillText(line, width / 2, y, maxWidth);
  });

  ctx.restore();
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    image.src = source;
  });
}

async function isAllowedImage(file) {
  const bytes = new Uint8Array(
    await file.slice(0, 8).arrayBuffer()
  );

  const png =
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value
    );

  const jpeg =
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255;

  return (
    (file.type === "image/png" && png) ||
    (file.type === "image/jpeg" && jpeg)
  );
}

$("imageInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const task = ++imageTask;
  let objectUrl;

  say("이미지를 불러오는 중입니다.");

  try {
    if (file.size > 10 * 1024 * 1024) {
      throw new Error("10MB 이하의 이미지를 선택해 주세요.");
    }

    if (!(await isAllowedImage(file))) {
      throw new Error("정상적인 PNG 또는 JPEG 파일만 사용할 수 있어요.");
    }

    objectUrl = URL.createObjectURL(file);
    const original = await loadImage(objectUrl);

    if (
      original.naturalWidth * original.naturalHeight > 40000000
    ) {
      throw new Error("이미지가 너무 큽니다. 크기를 줄여 다시 선택해 주세요.");
    }

    // 저장 공간을 아끼기 위해 긴 변을 최대 1600px로 줄입니다.
    const scale = Math.min(
      1,
      1600 / Math.max(original.naturalWidth, original.naturalHeight)
    );

    const buffer = document.createElement("canvas");
    buffer.width = Math.max(1, Math.round(original.naturalWidth * scale));
    buffer.height = Math.max(1, Math.round(original.naturalHeight * scale));

    buffer.getContext("2d").drawImage(
      original,
      0,
      0,
      buffer.width,
      buffer.height
    );

    const data = buffer.toDataURL("image/png");
    const prepared = await loadImage(data);

    if (task !== imageTask) return;

    currentImage = prepared;
    imageData = data;
    draw();
    say("이미지를 넣었어요. 문구와 색상을 바꿔보세요.");
  } catch (error) {
    if (task === imageTask) say(error.message);
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (task === imageTask) event.target.value = "";
  }
});

$("removeImageBtn").addEventListener("click", () => {
  imageTask += 1;
  currentImage = null;
  imageData = "";
  $("imageInput").value = "";
  draw();
  say("이미지를 지웠어요.");
});

[
  "textInput",
  "ratioSelect",
  "fontSizeInput",
  "textColorInput",
  "bgColorInput",
  "textPositionSelect",
].forEach((id) => {
  $(id).addEventListener("input", draw);
});

function download(type) {
  draw();

  const extension = type === "image/png" ? "png" : "jpg";

  canvas.toBlob((blob) => {
    if (!blob) {
      say("파일을 만들지 못했어요. 다시 시도해 주세요.");
      return;
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `my-card-${Date.now()}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 10000);
    say("다운로드를 요청했어요. 브라우저의 다운로드 목록을 확인해 주세요.");
  }, type, 0.95);
}

$("downloadPngBtn").addEventListener("click", () => {
  download("image/png");
});

$("downloadJpegBtn").addEventListener("click", () => {
  download("image/jpeg");
});

function refreshTemplates(selectedId = "") {
  const select = $("templateSelect");
  select.replaceChildren(new Option("템플릿을 선택하세요", ""));

  templates.forEach((template) => {
    select.add(new Option(template.name, template.id));
  });

  select.value = selectedId;
}

function persistTemplates(nextTemplates) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextTemplates));
    templates = nextTemplates;
    return true;
  } catch {
    say(
      "저장하지 못했어요. 저장 공간이 부족하거나 브라우저가 저장을 차단했을 수 있어요. 이미지 크기를 줄여보세요."
    );
    return false;
  }
}

function getTemplateName() {
  const name = $("templateNameInput").value.trim();

  if (!name) {
    say("템플릿 이름을 입력해 주세요.");
    $("templateNameInput").focus();
    return null;
  }

  return name;
}

function selectedTemplate() {
  const selected = templates.find(
    (template) => template.id === $("templateSelect").value
  );

  if (!selected) say("저장한 템플릿을 먼저 선택해 주세요.");
  return selected;
}

$("saveTemplateBtn").addEventListener("click", () => {
  const name = getTemplateName();
  if (!name) return;

  const template = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name,
    settings: getSettings(),
    image: imageData,
  };

  if (persistTemplates([...templates, template])) {
    refreshTemplates(template.id);
    say("문구·디자인·이미지를 새 템플릿으로 저장했어요.");
  }
});

$("loadTemplateBtn").addEventListener("click", async () => {
  const template = selectedTemplate();
  if (!template) return;

  const task = ++imageTask;
  say("템플릿을 불러오는 중입니다.");

  try {
    const image = template.image
      ? await loadImage(template.image)
      : null;

    if (task !== imageTask) return;

    applySettings(template.settings);
    currentImage = image;
    imageData = template.image;
    $("templateNameInput").value = template.name;
    $("imageInput").value = "";

    draw();
    say("템플릿을 불러왔어요.");
  } catch {
    if (task === imageTask) {
      say("템플릿 이미지를 읽지 못했어요. 다른 템플릿을 선택해 주세요.");
    }
  }
});

$("updateTemplateBtn").addEventListener("click", () => {
  const selected = selectedTemplate();
  if (!selected) return;

  const name = getTemplateName();
  if (!name) return;

  const updated = {
    id: selected.id,
    name,
    settings: getSettings(),
    image: imageData,
  };

  const next = templates.map((template) =>
    template.id === selected.id ? updated : template
  );

  if (persistTemplates(next)) {
    refreshTemplates(selected.id);
    say("선택한 템플릿을 현재 내용으로 수정했어요.");
  }
});

$("deleteTemplateBtn").addEventListener("click", () => {
  const selected = selectedTemplate();
  if (!selected) return;

  if (!confirm(`"${selected.name}" 템플릿을 삭제할까요?`)) return;

  const next = templates.filter(
    (template) => template.id !== selected.id
  );

  if (persistTemplates(next)) {
    refreshTemplates();
    say("템플릿을 삭제했어요.");
  }
});

function restoreTemplates() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) return;

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed)) {
      throw new Error("잘못된 저장 데이터");
    }

    const ids = new Set();

    const valid = parsed.every((template) => {
      if (
        !template ||
        typeof template.id !== "string" ||
        !template.id ||
        ids.has(template.id) ||
        typeof template.name !== "string" ||
        !template.name.trim() ||
        template.name.length > 40 ||
        !validSettings(template.settings) ||
        typeof template.image !== "string" ||
        (template.image !== "" &&
          !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(
            template.image
          ))
      ) {
        return false;
      }

      ids.add(template.id);
      return true;
    });

    if (!valid) throw new Error("잘못된 저장 데이터");

    templates = parsed;
  } catch {
    templates = [];
    say(
      "저장 데이터를 불러오지 못해 빈 목록으로 시작했어요. 편집과 다운로드는 계속 사용할 수 있어요."
    );
  }
}

restoreTemplates();
refreshTemplates();
draw();