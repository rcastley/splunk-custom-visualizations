import type { DataSourcesState } from '@splunk/dashboard-studio-extension/visualization';

export type SplunkSearchData = {
    /**
    [{ name: 'host' }, { name: 'count' }] or ['host', 'count']
    **/
    fields?: ({ name?: string } | string)[];
    rows?: unknown[][];
    columns?: unknown[][];
};

export type DataSources = DataSourcesState['dataSources'];
