import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface ExportPdfOptions {
  fileName?: string;
  reportTitle?: string;
}

export const exportElementToPdf = async (
  element: HTMLElement,
  options: ExportPdfOptions = {}
): Promise<void> => {
  const { 
    fileName = 'Bao_Cao_Phan_Tich.pdf',
    reportTitle = 'BÁO CÁO PHÂN TÍCH ĐẦU TƯ CHỨNG KHOÁN'
  } = options;

  // 1. Temporarily open all <details> elements to ensure full content is captured
  const detailsElements = Array.from(element.querySelectorAll('details'));
  const originalDetailsStates = detailsElements.map((det) => det.open);
  detailsElements.forEach((det) => {
    det.open = true;
  });

  // 2. Hide interactive/unwanted elements (e.g. PDF Export button, Watchlist button, News)
  const ignoreElements = Array.from(
    element.querySelectorAll<HTMLElement>('[data-pdf-ignore="true"]')
  );
  const originalDisplays = ignoreElements.map((el) => el.style.display);
  ignoreElements.forEach((el) => {
    el.style.display = 'none';
  });

  try {
    // Wait for DOM reflow after expanding all sections
    await new Promise((resolve) => setTimeout(resolve, 350));

    const rootRect = element.getBoundingClientRect();

    // 3. Render element to high-res canvas with natural web app sizing and sharp Vietnamese typography
    const canvas = await html2canvas(element, {
      scale: 2.5,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#111827', // Matching dark theme
      logging: false,
      scrollX: 0,
      scrollY: -window.scrollY,
      windowWidth: element.scrollWidth || 1024,
      onclone: (clonedDoc) => {
        const style = clonedDoc.createElement('style');
        style.innerHTML = `
          * {
            text-rendering: optimizeLegibility !important;
            -webkit-font-smoothing: antialiased !important;
          }
          strong, b, .font-bold, .font-semibold, .font-extrabold, th, h1, h2, h3, h4 {
            letter-spacing: 0.025em !important;
          }
          table, td, th {
            border-collapse: collapse !important;
          }
        `;
        clonedDoc.head.appendChild(style);
      }
    });

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const canvasScale = canvasHeight / rootRect.height;

    // 4. A4 dimensions setup in millimeters
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidthMm = 210;
    const pageHeightMm = 297;
    const marginX = 10;
    const marginTop = 12;
    const marginBottom = 15;
    const contentWidthMm = pageWidthMm - marginX * 2; // 190mm
    const contentHeightMm = pageHeightMm - marginTop - marginBottom; // 270mm

    const pxPerMm = canvasWidth / contentWidthMm;
    const maxPageHeightCanvasPx = contentHeightMm * pxPerMm;

    // Collect all candidate structural break elements (headings, paragraphs, list items, cards, table rows)
    const candidateNodes = Array.from(
      element.querySelectorAll<HTMLElement>(
        'details, summary, section, article, .border, .rounded-xl, .rounded-lg, .grid > *, h1, h2, h3, h4, p, li, tr'
      )
    );

    // Map DOM elements to Canvas pixel Y-ranges
    const elementBounds = candidateNodes
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const top = (rect.top - rootRect.top) * canvasScale;
        const bottom = (rect.bottom - rootRect.top) * canvasScale;
        return { top, bottom, height: bottom - top };
      })
      .filter((b) => b.top >= 0 && b.bottom <= canvasHeight && b.height > 5)
      .sort((a, b) => a.top - b.top);

    // Calculate smart slice boundaries so pages fill up to 85-95% naturally without cutting text
    const slices: { startY: number; endY: number }[] = [];
    let currentY = 0;

    while (currentY < canvasHeight) {
      if (canvasHeight - currentY <= maxPageHeightCanvasPx) {
        // Remaining content fits on the final page
        slices.push({ startY: currentY, endY: canvasHeight });
        break;
      }

      const idealEndY = currentY + maxPageHeightCanvasPx;
      let chosenCutY = idealEndY;

      // Find an element that crosses idealEndY
      const crossingElement = elementBounds.find(
        (b) => b.top < idealEndY && b.bottom > idealEndY
      );

      if (crossingElement) {
        // If the crossing element starts reasonably close to the bottom (>= 70% down), break cleanly before it
        if (crossingElement.top - currentY >= maxPageHeightCanvasPx * 0.70) {
          chosenCutY = Math.max(currentY + 50, crossingElement.top - 8 * canvasScale);
        } else {
          // If crossing element is very tall, find the closest previous paragraph/list-item break
          const prevBreak = elementBounds
            .filter((b) => b.top >= currentY + maxPageHeightCanvasPx * 0.75 && b.top < idealEndY)
            .pop();
          if (prevBreak) {
            chosenCutY = Math.max(currentY + 50, prevBreak.top - 6 * canvasScale);
          } else {
            chosenCutY = idealEndY - 15 * pxPerMm;
          }
        }
      } else {
        // Find natural gap before idealEndY to maximize page fill
        const naturalBreak = elementBounds
          .filter((b) => b.top >= currentY + maxPageHeightCanvasPx * 0.80 && b.top <= idealEndY)
          .pop();
        if (naturalBreak) {
          chosenCutY = Math.max(currentY + 50, naturalBreak.top - 6 * canvasScale);
        }
      }

      // Safety guard against infinite loop or 0-height slices
      if (chosenCutY <= currentY + 50) {
        chosenCutY = currentY + maxPageHeightCanvasPx;
      }

      slices.push({ startY: currentY, endY: chosenCutY });
      currentY = chosenCutY;
    }

    const totalPages = slices.length;

    // Helper to clean accented text for jsPDF default font in top header
    const cleanHeaderTitle = reportTitle
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toUpperCase();

    // 5. Draw each slice onto PDF with background, header, and centered footer
    slices.forEach((slice, pageIndex) => {
      if (pageIndex > 0) {
        pdf.addPage();
      }

      // Fill full page with dark background
      pdf.setFillColor(17, 24, 39);
      pdf.rect(0, 0, pageWidthMm, pageHeightMm, 'F');

      const sliceHeightPx = slice.endY - slice.startY;
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = canvasWidth;
      sliceCanvas.height = sliceHeightPx;

      const sliceCtx = sliceCanvas.getContext('2d');
      if (sliceCtx) {
        sliceCtx.fillStyle = '#111827';
        sliceCtx.fillRect(0, 0, canvasWidth, sliceHeightPx);
        sliceCtx.drawImage(
          canvas,
          0,
          slice.startY,
          canvasWidth,
          sliceHeightPx,
          0,
          0,
          canvasWidth,
          sliceHeightPx
        );
      }

      const sliceHeightMm = sliceHeightPx / pxPerMm;
      const sliceImgData = sliceCanvas.toDataURL('image/jpeg', 0.95);

      pdf.addImage(
        sliceImgData,
        'JPEG',
        marginX,
        marginTop,
        contentWidthMm,
        sliceHeightMm,
        undefined,
        'FAST'
      );

      // Top subtle header
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(156, 163, 175);
      pdf.text(cleanHeaderTitle, marginX, 8);
      pdf.text(new Date().toLocaleDateString('vi-VN'), pageWidthMm - marginX, 8, {
        align: 'right',
      });

      // Bottom footer: "© daututaichinh.pro" CANH GIỮA, FONT SIZE 11 BOLD
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(56, 189, 248); // Cyan-400 nổi bật
      pdf.text('© daututaichinh.pro', pageWidthMm / 2, pageHeightMm - 6, {
        align: 'center',
      });

      // Page numbers on bottom right
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(156, 163, 175);
      pdf.text(`Trang ${pageIndex + 1} / ${totalPages}`, pageWidthMm - marginX, pageHeightMm - 6, {
        align: 'right',
      });
    });

    // 6. Trigger download
    pdf.save(fileName);
  } finally {
    // Restore original details open/close state
    detailsElements.forEach((det, idx) => {
      det.open = originalDetailsStates[idx];
    });

    // Restore hidden elements
    ignoreElements.forEach((el, idx) => {
      el.style.display = originalDisplays[idx];
    });
  }
};
