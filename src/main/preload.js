const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    auth: {
        login: (credentials) => ipcRenderer.invoke('auth:login', credentials)
    },
    
    customers: {
        getAll: () => ipcRenderer.invoke('customer:getAll'),
        search: (query) => ipcRenderer.invoke('customer:search', query),
        getById: (id) => ipcRenderer.invoke('customer:getById', id),
        getByMeterNumber: (meterNumber) => ipcRenderer.invoke('customer:getByMeterNumber', meterNumber),
        create: (data) => ipcRenderer.invoke('customer:create', data),
        update: (id, data) => ipcRenderer.invoke('customer:update', id, data),
        delete: (id) => ipcRenderer.invoke('customer:delete', id),
        getClusters: () => ipcRenderer.invoke('customer:getClusters'),
        getByCluster: (cluster) => ipcRenderer.invoke('customer:getByCluster', cluster),
        count: () => ipcRenderer.invoke('customer:count')
    },

    bills: {
        calculate: (prev, curr, discount, penalty) =>ipcRenderer.invoke('bill:calculate', prev, curr, discount || 0, penalty || 0),
        create: (data) => ipcRenderer.invoke('bill:create', data),
        getByCustomer: (customerId) => ipcRenderer.invoke('bill:getByCustomer', customerId),
        getRecent: (limit) => ipcRenderer.invoke('bill:getRecent', limit),
        getById: (id) => ipcRenderer.invoke('bill:getById', id),
        getLastReading: (customerId) => ipcRenderer.invoke('bill:getLastReading', customerId),
        getArrears: (customerId) => ipcRenderer.invoke('bill:getArrears', customerId),
        getBillingPeriod: (date) => ipcRenderer.invoke('bill:getBillingPeriod', date),
        getDueDate: (billingDate) => ipcRenderer.invoke('bill:getDueDate', billingDate),
        getByClusterPeriod: (cluster, billingDate, billingPeriod) => ipcRenderer.invoke('bill:getByClusterPeriod', cluster, billingDate, billingPeriod)
    },

    payments: {
        process: (data) => ipcRenderer.invoke('payment:process', data),
        getByCustomer: (customerId) => ipcRenderer.invoke('payment:getByCustomer', customerId),
        getById: (id) => ipcRenderer.invoke('payment:getById', id),
        getAll: (limit) => ipcRenderer.invoke('payment:getAll', limit),
        getAllocations: (paymentId) => ipcRenderer.invoke('payment:getAllocations', paymentId),
        getCustomerBalance: (customerId) => ipcRenderer.invoke('payment:getCustomerBalance', customerId)
    },

    db: {
        test: () => ipcRenderer.invoke('db:test'),
        save: () => ipcRenderer.invoke('db:save')  
    },
    logger: {
        getRecent: (lines) => ipcRenderer.invoke('logger:getRecent', lines),
        getPath: () => ipcRenderer.invoke('logger:getPath')
    }
});

    console.log('✅ Preload script loaded');