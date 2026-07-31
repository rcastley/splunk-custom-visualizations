import type { SplunkSearchData } from './types/data';

export type NormalizedData = {
    fields: string[];
    rows: unknown[][];
    fieldIndex: Record<string, number>;
};

export type HealthStatus = 'healthy' | 'warning' | 'critical';

export type IndexMetric = {
    name: string;
    sizeMb: number;
    maxSizeMb: number;
    utilization: number;
    eventRate: number | null;
    ageSeconds: number;
    status: HealthStatus;
};

export type IndexHealthModel = {
    indexes: IndexMetric[];
    totalCount: number;
    healthyCount: number;
    warningCount: number;
    criticalCount: number;
    averageUtilization: number;
};

export type IndexHealthOptions = {
    indexField: string;
    sizeField: string;
    maxSizeField: string;
    eventRateField: string;
    ageField: string;
    warningThreshold: number;
    criticalThreshold: number;
    staleAfterSeconds: number;
    maxIndexes: number;
    showEventRate: boolean;
    showOverflowCount: boolean;
    healthyColor: string;
    warningColor: string;
    criticalColor: string;
};

const DEFAULTS: IndexHealthOptions = {
    indexField: 'index',
    sizeField: 'current_size_mb',
    maxSizeField: 'max_size_mb',
    eventRateField: 'event_rate',
    ageField: 'latest_event_age_seconds',
    warningThreshold: 75,
    criticalThreshold: 90,
    staleAfterSeconds: 900,
    maxIndexes: 8,
    showEventRate: true,
    showOverflowCount: true,
    healthyColor: '#53A051',
    warningColor: '#F8BE34',
    criticalColor: '#DC4E41',
};

export function normalizeSearchData(data: SplunkSearchData): NormalizedData {
    const fields = (data.fields || []).map((field) =>
        typeof field === 'string' ? field : field.name || ''
    );
    const rows = data.rows?.length
        ? data.rows
        : Array.from({ length: data.columns?.[0]?.length || 0 }, (_, rowIndex) =>
              (data.columns || []).map((column) => column[rowIndex])
          );
    const fieldIndex = fields.reduce<Record<string, number>>((result, name, index) => {
        result[name] = index;
        return result;
    }, {});
    return {
        fields,
        rows,
        fieldIndex,
    };
}

function stringOption(value: unknown, fallback: string) {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function numberOption(value: unknown, fallback: number, minimum: number, maximum: number) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
}

function colorOption(value: unknown, fallback: string) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

export function parseOptions(
    raw: Record<string, unknown>
): IndexHealthOptions | { error: string } {
    const options: IndexHealthOptions = {
        indexField: stringOption(raw.indexField, DEFAULTS.indexField),
        sizeField: stringOption(raw.sizeField, DEFAULTS.sizeField),
        maxSizeField: stringOption(raw.maxSizeField, DEFAULTS.maxSizeField),
        eventRateField: stringOption(raw.eventRateField, DEFAULTS.eventRateField),
        ageField: stringOption(raw.ageField, DEFAULTS.ageField),
        warningThreshold: numberOption(raw.warningThreshold, DEFAULTS.warningThreshold, 0, 100),
        criticalThreshold: numberOption(raw.criticalThreshold, DEFAULTS.criticalThreshold, 0, 100),
        staleAfterSeconds: numberOption(raw.staleAfterSeconds, DEFAULTS.staleAfterSeconds, 1, 86400),
        maxIndexes: Math.round(numberOption(raw.maxIndexes, DEFAULTS.maxIndexes, 1, 50)),
        showEventRate:
            typeof raw.showEventRate === 'boolean' ? raw.showEventRate : DEFAULTS.showEventRate,
        showOverflowCount:
            typeof raw.showOverflowCount === 'boolean'
                ? raw.showOverflowCount
                : DEFAULTS.showOverflowCount,
        healthyColor: colorOption(raw.healthyColor, DEFAULTS.healthyColor),
        warningColor: colorOption(raw.warningColor, DEFAULTS.warningColor),
        criticalColor: colorOption(raw.criticalColor, DEFAULTS.criticalColor),
    };

    if (options.warningThreshold >= options.criticalThreshold) {
        return { error: 'Warning threshold must be lower than critical threshold.' };
    }
    return options;
}

function toFiniteNumber(value: unknown) {
    const parsed = Number.parseFloat(String(value));
    return Number.isFinite(parsed) ? parsed : null;
}

function statusFor(
    utilization: number,
    ageSeconds: number,
    options: IndexHealthOptions
): HealthStatus {
    if (
        utilization >= options.criticalThreshold ||
        ageSeconds >= options.staleAfterSeconds * 2
    ) {
        return 'critical';
    }
    if (utilization >= options.warningThreshold || ageSeconds >= options.staleAfterSeconds) {
        return 'warning';
    }
    return 'healthy';
}

export function buildIndexHealthModel(
    data: NormalizedData,
    options: IndexHealthOptions
): { model: IndexHealthModel } | { error: string } {
    const requiredFields = [
        options.indexField,
        options.sizeField,
        options.maxSizeField,
        options.ageField,
    ];
    const missing = requiredFields.filter((field) => data.fieldIndex[field] === undefined);
    if (missing.length) return { error: `Required field${missing.length > 1 ? 's' : ''} not found: ${missing.join(', ')}` };

    const indexes: IndexMetric[] = [];
    for (let rowIndex = 0; rowIndex < data.rows.length; rowIndex += 1) {
        const row = data.rows[rowIndex];
        const name = String(row[data.fieldIndex[options.indexField]] ?? '').trim();
        const sizeMb = toFiniteNumber(row[data.fieldIndex[options.sizeField]]);
        const maxSizeMb = toFiniteNumber(row[data.fieldIndex[options.maxSizeField]]);
        const ageSeconds = toFiniteNumber(row[data.fieldIndex[options.ageField]]);
        const eventRateIndex = data.fieldIndex[options.eventRateField];
        const eventRate =
            eventRateIndex === undefined ? null : toFiniteNumber(row[eventRateIndex]);

        if (!name || sizeMb === null || maxSizeMb === null || maxSizeMb <= 0 || ageSeconds === null) {
            return {
                error: `Row ${rowIndex + 1} must contain an index name, numeric sizes (maximum above zero), and a numeric event age.`,
            };
        }

        const utilization = Math.max(0, (sizeMb / maxSizeMb) * 100);
        indexes.push({
            name,
            sizeMb: Math.max(0, sizeMb),
            maxSizeMb,
            utilization,
            eventRate,
            ageSeconds: Math.max(0, ageSeconds),
            status: statusFor(utilization, Math.max(0, ageSeconds), options),
        });
    }

    const rank = { critical: 2, warning: 1, healthy: 0 };
    indexes.sort((a, b) => rank[b.status] - rank[a.status] || b.utilization - a.utilization);
    const visibleIndexes = indexes.slice(0, options.maxIndexes);
    const counts = indexes.reduce(
        (result, index) => ({ ...result, [index.status]: result[index.status] + 1 }),
        { healthy: 0, warning: 0, critical: 0 }
    );

    return {
        model: {
            indexes: visibleIndexes,
            totalCount: indexes.length,
            healthyCount: counts.healthy,
            warningCount: counts.warning,
            criticalCount: counts.critical,
            averageUtilization:
                indexes.reduce((total, index) => total + index.utilization, 0) / indexes.length,
        },
    };
}
