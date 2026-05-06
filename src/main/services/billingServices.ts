import { getBillRepository } from '../database';
import { getCustomerRepository } from '../database';
import { CreateBillDTO } from '../../shared/types/bill';
import { calculateBill, getBillingPeriod, calculateDueDate } from '../utils/billingCalculator';

export class BillService {
    
    async createBill(data: CreateBillDTO) {
        try {
            const billRepo = getBillRepository();
            const customerRepo = getCustomerRepository();
            
            // Verify customer exists
            const customer = customerRepo.findById(data.customer_id);
            if (!customer) {
                return { success: false, error: 'Customer not found' };
            }
            
            // Get arrears
            const arrears = billRepo.getCustomerArrears(data.customer_id);
            
            // Create bill with calculated values
            const fullData = {
                ...data,
                arrears
            };
            
            const bill = billRepo.create(fullData);
            
            return { 
                success: true, 
                data: bill,
                message: `Invoice ${bill?.invoice_number} created`
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
    
    async getByClusterPeriod(cluster: string, billingDate: string, billingPeriod: string) {
        const billRepo = getBillRepository();
        return billRepo.findByClusterPeriod(cluster, billingDate, billingPeriod);
    }

    async calculatePreview(previousReading: number, currentReading: number, discount: number = 0, penalty: number = 0) {
        return calculateBill(previousReading, currentReading, discount, penalty, 0);
    }
    
    async getCustomerBills(customerId: number) {
        const billRepo = getBillRepository();
        return billRepo.findByCustomerId(customerId);
    }
    
    async getRecentBills(limit: number = 50) {
        const billRepo = getBillRepository();
        return billRepo.findAllWithCustomer().slice(0, limit);
    }
    
    async getBillById(id: number) {
        const billRepo = getBillRepository();
        return billRepo.findById(id);
    }
    
    async getLastReading(customerId: number) {
        console.log('🔴 BillService.getLastReading called, customerId:', customerId);
        const billRepo = getBillRepository();
        console.log('🔴 BillService.getLastReading - got billRepo');
        return billRepo.getLastReading(customerId);
    }
    
    async getCustomerArrears(customerId: number) {
        console.log('🔴 BillService.getCustomerArrears called, customerId:', customerId);
        const billRepo = getBillRepository();
        console.log('🔴 BillService.getCustomerArrears - got billRepo');
        return billRepo.getCustomerArrears(customerId);
    }
    
    getBillingPeriod(date: string) {
        return getBillingPeriod(date);
    }
    
    getDueDate(billingDate: string) {
        return calculateDueDate(billingDate);
    }
}