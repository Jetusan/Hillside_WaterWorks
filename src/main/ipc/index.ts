import { ipcMain } from 'electron';
import { getDatabase, saveDatabase } from '../database';
import { AuthService } from '../services/authServices';
import { CustomerService } from '../services/customerServices';  
import { BillService } from '../services/billingServices';
import {PaymentService} from '../services/paymentServices';
import { LoginCredentials, AuthResponse } from '../../shared/types/auth';
import { logger } from '../utils/logger';

export function registerAllHandlers(): void {
    console.log('📝 Registering IPC handlers...');
    
    ipcMain.handle('logger:getRecent', (_, lines: number = 100) => {
        return logger.getRecentLogs(lines);
    });

    // ✅ Services created AFTER database is ready
    const authService = new AuthService();
    const customerService = new CustomerService();  
    const billService = new BillService();
    const paymentService = new PaymentService();
    
    console.log('✅ Services initialized');

    // ===== AUTH HANDLERS =====
    ipcMain.handle('auth:login', async (_, credentials: LoginCredentials) => {
        try {
            console.log(`📨 IPC: auth:login - ${credentials.username}`);
            const result = await authService.login(credentials);
            
            if (result.success) {
                console.log(`✅ IPC: Login successful for ${credentials.username}`);
            } else {
                console.log(`❌ IPC: Login failed for ${credentials.username}: ${result.error}`);
                if (result.rateLimited) {
                    console.log(`⛔ IPC: Rate limited - ${credentials.username}`);
                }
            }
            
            return result;
        } catch (error: any) {
            console.error('❌ IPC: Login handler error:', error);
            return {
                success: false,
                error: 'Internal server error',
                rateLimited: false,
                remainingAttempts: 0
            } as AuthResponse;
        }
    });

    // ===== DATABASE TEST =====
    ipcMain.handle('db:test', () => {
        try {
            const db = getDatabase();
            const stmt = db.prepare('SELECT sqlite_version() as version');
            const result = stmt.getAsObject();
            stmt.free();
            return { success: true, version: result.version };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('db:save', () => {
        try {
            saveDatabase();
            console.log('✅ Database saved via IPC');
            return { success: true, message: 'Database saved to disk' };
        } catch (error: any) {
            console.error('❌ Save failed:', error);
            return { success: false, error: error.message };
        }
    });

    // ===== CUSTOMER HANDLERS ===== 
    ipcMain.handle('customer:getAll', async () => {
        return await customerService.getAllCustomers();
    });

    ipcMain.handle('customer:search', async (_, query: string) => {
        return await customerService.searchCustomers(query);
    });

    ipcMain.handle('customer:getById', async (_, id: number) => {
        return await customerService.getCustomerById(id);
    });

    ipcMain.handle('customer:getByMeterNumber', async (_, meterNumber: string) => {
        return await customerService.getCustomerByMeterNumber(meterNumber);
    });

    ipcMain.handle('customer:create', async (_, data) => {
        return await customerService.createCustomer(data);
    });

    ipcMain.handle('customer:update', async (_, id: number, data) => {
        return await customerService.updateCustomer(id, data);
    });

    ipcMain.handle('customer:delete', async (_, id: number) => {
        return await customerService.deleteCustomer(id);
    });

    ipcMain.handle('customer:getClusters', async () => {
        return await customerService.getAllClusters();
    });

    ipcMain.handle('customer:getByCluster', async (_, cluster: string) => {
        return await customerService.getCustomersByCluster(cluster);
    });

    ipcMain.handle('customer:count', async () => {
        return await customerService.getCustomerCount();
    });

    // ===== BILL HANDLERS (WITH DEBUG LOGGING) =====
    ipcMain.handle('bill:calculate', async (_, prev, curr, discount, penalty) => {
        console.log('🔵 bill:calculate called:', { prev, curr, discount, penalty });
        return billService.calculatePreview(prev, curr, discount, penalty);
    });

    ipcMain.handle('bill:create', async (_, data) => {
        console.log('🔵 bill:create called:', data);
        return await billService.createBill(data);
    });

    ipcMain.handle('bill:getByCustomer', async (_, customerId) => {
        console.log('🔵 bill:getByCustomer called, customerId:', customerId);
        return await billService.getCustomerBills(customerId);
    });

    ipcMain.handle('bill:getRecent', async (_, limit) => {
        console.log('🔵 bill:getRecent called, limit:', limit);
        return await billService.getRecentBills(limit || 50);
    });

    ipcMain.handle('bill:getById', async (_, id) => {
        console.log('🔵 bill:getById called, id:', id);
        return await billService.getBillById(id);
    });

    ipcMain.handle('bill:getLastReading', async (_, customerId) => {
        console.log('🔵🔵🔵 bill:getLastReading CALLED 🔵🔵🔵');
        console.log('🔵 customerId:', customerId);
        console.log('🔵 customerId type:', typeof customerId);
        
        try {
            const result = await billService.getLastReading(customerId);
            console.log('🔵 getLastReading RESULT:', result);
            console.log('🔵 result type:', typeof result);
            return result;
        } catch (error) {
            console.error('🔵 getLastReading ERROR:', error);
            return 0;
        }
    });

    ipcMain.handle('bill:getByClusterPeriod', async (_, cluster: string, billingDate: string, billingPeriod: string) => {
        console.log('🔵 bill:getByClusterPeriod called:', { cluster, billingDate, billingPeriod });
        return await billService.getByClusterPeriod(cluster, billingDate, billingPeriod);
    });
    
    ipcMain.handle('bill:getArrears', async (_, customerId) => {
        console.log('🔵 bill:getArrears called, customerId:', customerId);
        try {
            const result = await billService.getCustomerArrears(customerId);
            console.log('🔵 getArrears result:', result);
            return result;
        } catch (error) {
            console.error('🔵 getArrears ERROR:', error);
            return 0;
        }
    });

    ipcMain.handle('bill:getBillingPeriod', async (_, date) => {
        console.log('🔵 bill:getBillingPeriod called, date:', date);
        return billService.getBillingPeriod(date);
    });

    ipcMain.handle('bill:getDueDate', async (_, billingDate) => {
        console.log('🔵 bill:getDueDate called, billingDate:', billingDate);
        return billService.getDueDate(billingDate);
    });

    // ===== PAYMENT HANDLERS =====
    ipcMain.handle('payment:process', async (_, data) => {
        return await paymentService.processPayment(data);
    });

    ipcMain.handle('payment:getByCustomer', async (_, customerId: number) => {
        return await paymentService.getCustomerPayments(customerId);
    });

    ipcMain.handle('payment:getById', async (_, id: number) => {
        return await paymentService.getPaymentById(id);
    });

    ipcMain.handle('payment:getAll', async (_, limit: number) => {
        return await paymentService.getAllPayments(limit || 100);
    });

    ipcMain.handle('payment:getAllocations', async (_, paymentId: number) => {
        return await paymentService.getPaymentAllocations(paymentId);
    });

    ipcMain.handle('payment:getCustomerBalance', async (_, customerId: number) => {
        return await paymentService.getCustomerBalance(customerId);
    });
    
    console.log('✅ All IPC handlers registered successfully');
}