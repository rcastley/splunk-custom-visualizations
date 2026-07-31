import type { HealthStatus, IndexHealthModel, IndexHealthOptions, IndexMetric } from './model';

type Theme = 'light' | 'dark';

const FONT = "'Lucida Grande', 'Lucida Sans Unicode', Arial, sans-serif";

const THEMES = {
    light: {
        text: '#20262C',
        muted: '#667481',
        panel: '#FFFFFF',
        panelBorder: '#E4E8EC',
        track: '#E9EDF1',
        shadow: 'rgba(28, 39, 49, 0.10)',
    },
    dark: {
        text: '#F3F5F7',
        muted: '#A9B4BE',
        panel: '#20272E',
        panelBorder: '#35404A',
        track: '#35404A',
        shadow: 'rgba(0, 0, 0, 0.28)',
    },
};

export function prepareCanvas(canvas: HTMLCanvasElement, width: number, height: number) {
    if (!(width > 0 && height > 0)) return null;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
    }
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    return context;
}

export function drawMessage(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    message: string,
    theme: Theme
) {
    const palette = THEMES[theme];
    context.save();
    context.fillStyle = palette.muted;
    context.font = `14px ${FONT}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(message, width / 2, height / 2);
    context.restore();
}

function roundedRect(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.arcTo(x + width, y, x + width, y + r, r);
    context.lineTo(x + width, y + height - r);
    context.arcTo(x + width, y + height, x + width - r, y + height, r);
    context.lineTo(x + r, y + height);
    context.arcTo(x, y + height, x, y + height - r, r);
    context.lineTo(x, y + r);
    context.arcTo(x, y, x + r, y, r);
    context.closePath();
}

function compactNumber(value: number) {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
    if (value >= 100) return Math.round(value).toLocaleString();
    return value.toFixed(value < 10 ? 1 : 0);
}

function storage(valueMb: number) {
    return valueMb >= 1024 ? `${compactNumber(valueMb / 1024)} GB` : `${compactNumber(valueMb)} MB`;
}

function age(value: number) {
    if (value < 60) return `${Math.round(value)}s ago`;
    if (value < 3600) return `${Math.round(value / 60)}m ago`;
    if (value < 86400) return `${Math.round(value / 3600)}h ago`;
    return `${Math.round(value / 86400)}d ago`;
}

function fitText(
    context: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
    fontSize: number,
    weight = 600
) {
    let size = fontSize;
    context.font = `${weight} ${size}px ${FONT}`;
    while (size > 9 && context.measureText(text).width > maxWidth) {
        size -= 1;
        context.font = `${weight} ${size}px ${FONT}`;
    }
    return size;
}

function statusColor(status: HealthStatus, options: IndexHealthOptions) {
    if (status === 'critical') return options.criticalColor;
    if (status === 'warning') return options.warningColor;
    return options.healthyColor;
}

function overallStatus(model: IndexHealthModel): HealthStatus {
    if (model.criticalCount) return 'critical';
    if (model.warningCount) return 'warning';
    return 'healthy';
}

function drawPill(
    context: CanvasRenderingContext2D,
    label: string,
    right: number,
    y: number,
    color: string,
    palette: (typeof THEMES)[Theme]
) {
    context.font = `700 11px ${FONT}`;
    const width = context.measureText(label).width + 28;
    roundedRect(context, right - width, y, width, 24, 12);
    context.fillStyle = `${color}24`;
    context.fill();
    context.beginPath();
    context.arc(right - width + 12, y + 12, 4, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();
    context.fillStyle = palette.text;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.fillText(label, right - width + 21, y + 12);
}

function drawSummary(
    context: CanvasRenderingContext2D,
    model: IndexHealthModel,
    x: number,
    y: number,
    width: number,
    compact: boolean,
    palette: (typeof THEMES)[Theme],
    options: IndexHealthOptions
) {
    const items = [
        { label: 'Healthy', value: model.healthyCount, color: options.healthyColor },
        { label: 'Warning', value: model.warningCount, color: options.warningColor },
        { label: 'Critical', value: model.criticalCount, color: options.criticalColor },
        { label: 'Avg. capacity', value: `${Math.round(model.averageUtilization)}%`, color: palette.muted },
    ];
    const gap = compact ? 6 : 10;
    const cardWidth = (width - gap * (items.length - 1)) / items.length;
    items.forEach((item, index) => {
        const cardX = x + index * (cardWidth + gap);
        roundedRect(context, cardX, y, cardWidth, compact ? 48 : 58, 10);
        context.fillStyle = palette.panel;
        context.fill();
        context.strokeStyle = palette.panelBorder;
        context.lineWidth = 1;
        context.stroke();
        context.fillStyle = item.color;
        context.font = `700 ${compact ? 16 : 20}px ${FONT}`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(String(item.value), cardX + cardWidth / 2, y + (compact ? 17 : 21));
        if (!compact || width > 360) {
            context.fillStyle = palette.muted;
            context.font = `10px ${FONT}`;
            context.fillText(item.label, cardX + cardWidth / 2, y + (compact ? 35 : 42));
        }
    });
}

function drawIndexCard(
    context: CanvasRenderingContext2D,
    metric: IndexMetric,
    x: number,
    y: number,
    width: number,
    height: number,
    palette: (typeof THEMES)[Theme],
    options: IndexHealthOptions,
    compact: boolean
) {
    const color = statusColor(metric.status, options);
    context.save();
    context.shadowColor = palette.shadow;
    context.shadowBlur = 14;
    context.shadowOffsetY = 4;
    roundedRect(context, x, y, width, height, 12);
    context.fillStyle = palette.panel;
    context.fill();
    context.shadowColor = 'transparent';
    context.strokeStyle = palette.panelBorder;
    context.lineWidth = 1;
    context.stroke();

    context.beginPath();
    context.arc(x + 17, y + 20, 5, 0, Math.PI * 2);
    context.fillStyle = color;
    context.fill();

    context.fillStyle = palette.text;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    fitText(context, metric.name, Math.max(60, width - 135), 13, 700);
    context.fillText(metric.name, x + 29, y + 20, Math.max(60, width - 135));

    context.fillStyle = color;
    context.font = `700 12px ${FONT}`;
    context.textAlign = 'right';
    context.fillText(`${Math.round(metric.utilization)}%`, x + width - 14, y + 20);

    const barX = x + 14;
    const barY = y + (compact ? 34 : 40);
    const barWidth = width - 28;
    roundedRect(context, barX, barY, barWidth, 6, 3);
    context.fillStyle = palette.track;
    context.fill();
    roundedRect(context, barX, barY, barWidth * Math.min(metric.utilization / 100, 1), 6, 3);
    context.fillStyle = color;
    context.fill();

    if (!compact) {
        context.font = `10px ${FONT}`;
        context.fillStyle = palette.muted;
        context.textAlign = 'left';
        context.fillText(`${storage(metric.sizeMb)} of ${storage(metric.maxSizeMb)}`, barX, y + 61);
        context.textAlign = 'right';
        const rate = metric.eventRate === null ? '— events/min' : `${compactNumber(metric.eventRate)} events/min`;
        context.fillText(
            options.showEventRate ? `${rate}  ·  ${age(metric.ageSeconds)}` : age(metric.ageSeconds),
            x + width - 14,
            y + 61
        );
    }
    context.restore();
}

export function drawIndexHealth(
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
    model: IndexHealthModel,
    options: IndexHealthOptions,
    theme: Theme
) {
    const palette = THEMES[theme];
    const padding = width < 420 ? 12 : 18;
    const compact = height < 270 || width < 300;
    const headerHeight = compact ? 34 : 42;
    const summaryHeight = compact ? 48 : 58;
    const summaryGap = compact ? 8 : 12;
    const contentTop = padding + headerHeight + summaryHeight + summaryGap * 2;
    const availableHeight = height - contentTop - padding;
    const columnCount = width >= 680 ? 2 : 1;
    const gap = width < 420 ? 8 : 12;
    const rowCount = Math.max(1, Math.ceil(model.indexes.length / columnCount));
    const idealCardHeight = compact ? 50 : 78;
    const cardHeight = Math.min(idealCardHeight, (availableHeight - gap * (rowCount - 1)) / rowCount);
    const visibleRows = Math.max(
        0,
        Math.floor((availableHeight + gap) / (Math.max(48, cardHeight) + gap))
    );
    const visibleCount = Math.min(model.indexes.length, visibleRows * columnCount);
    const cardWidth = (width - padding * 2 - gap * (columnCount - 1)) / columnCount;

    context.save();
    context.fillStyle = palette.text;
    context.textAlign = 'left';
    context.textBaseline = 'middle';
    context.font = `700 ${compact ? 16 : 19}px ${FONT}`;
    context.fillText('Index health', padding, padding + 13);
    if (!compact) {
        context.fillStyle = palette.muted;
        context.font = `11px ${FONT}`;
        context.fillText(`${model.totalCount} indexes monitored`, padding, padding + 34);
    }

    const overall = overallStatus(model);
    drawPill(
        context,
        overall.charAt(0).toUpperCase() + overall.slice(1),
        width - padding,
        padding,
        statusColor(overall, options),
        palette
    );
    drawSummary(
        context,
        model,
        padding,
        padding + headerHeight,
        width - padding * 2,
        compact,
        palette,
        options
    );

    model.indexes.slice(0, visibleCount).forEach((metric, index) => {
        const column = index % columnCount;
        const row = Math.floor(index / columnCount);
        drawIndexCard(
            context,
            metric,
            padding + column * (cardWidth + gap),
            contentTop + row * (Math.max(48, cardHeight) + gap),
            cardWidth,
            Math.max(48, cardHeight),
            palette,
            options,
            compact || cardHeight < 70
        );
    });

    if (visibleCount === 0) {
        drawMessage(context, width, height, 'Increase the panel height to show indexes', theme);
    } else if (options.showOverflowCount && model.totalCount > visibleCount) {
        context.fillStyle = palette.muted;
        context.font = `10px ${FONT}`;
        context.textAlign = 'right';
        context.fillText(`Showing ${visibleCount} of ${model.totalCount}`, width - padding, height - 5);
    }
    context.restore();
}
