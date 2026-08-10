function createTransparentAssetPng(width, height, kind) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  context.lineCap = "round";
  context.lineJoin = "round";

  if (kind === "illustration") {
    context.fillStyle = "#5dd6c6";
    context.beginPath();
    context.arc(width * 0.5, height * 0.48, width * 0.34, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#f6f7fb";
    context.beginPath();
    context.arc(width * 0.58, height * 0.28, width * 0.12, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = "#17202a";
    context.lineWidth = 8;
    context.beginPath();
    context.moveTo(width * 0.54, height * 0.42);
    context.lineTo(width * 0.38, height * 0.58);
    context.lineTo(width * 0.28, height * 0.78);
    context.moveTo(width * 0.44, height * 0.54);
    context.lineTo(width * 0.66, height * 0.66);
    context.lineTo(width * 0.78, height * 0.82);
    context.stroke();
    return canvas.toDataURL("image/png");
  }

  context.strokeStyle = "#17202a";
  context.lineWidth = 7;
  if (kind === "home") {
    context.beginPath();
    context.moveTo(width * 0.2, height * 0.48);
    context.lineTo(width * 0.5, height * 0.22);
    context.lineTo(width * 0.8, height * 0.48);
    context.lineTo(width * 0.8, height * 0.78);
    context.lineTo(width * 0.28, height * 0.78);
    context.lineTo(width * 0.28, height * 0.48);
    context.stroke();
  } else if (kind === "bolt") {
    context.fillStyle = "#17202a";
    context.beginPath();
    context.moveTo(width * 0.55, height * 0.12);
    context.lineTo(width * 0.24, height * 0.54);
    context.lineTo(width * 0.48, height * 0.54);
    context.lineTo(width * 0.4, height * 0.88);
    context.lineTo(width * 0.76, height * 0.44);
    context.lineTo(width * 0.52, height * 0.44);
    context.closePath();
    context.fill();
  } else {
    context.beginPath();
    context.arc(width * 0.5, height * 0.34, width * 0.16, 0, Math.PI * 2);
    context.moveTo(width * 0.22, height * 0.82);
    context.quadraticCurveTo(width * 0.5, height * 0.56, width * 0.78, height * 0.82);
    context.stroke();
  }

  return canvas.toDataURL("image/png");
}

if (typeof module !== "undefined") {
  module.exports = {
    createTransparentAssetPng
  };
}
