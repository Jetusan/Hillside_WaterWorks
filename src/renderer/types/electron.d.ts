import type { LoginCredentials, AuthResponse } from '../../shared/types/auth';
import type { Customer, CreateCustomerDTO, UpdateCustomerDTO } from '../../shared/types/customer';
import type { Payment, CreatePaymentDTO, PaymentWithCustomer, PaymentAllocation, PaymentResult } from '../../shared/types/payment';

declare global {    
    interface Window {
        electronAPI: {
            auth: {
                login: (credentials: LoginCredentials) => Promise<AuthResponse>;
            };
            customers: {
                add(newCustomer: { customer_name: string; meter_number: string; cluster: string; is_active: number; }): unknown;
                getAll: () => Promise<Customer[]>;
                search: (query: string) => Promise<Customer[]>;
                getById: (id: number) => Promise<Customer | null>;
                getByMeterNumber: (meterNumber: string) => Promise<Customer | null>;
                create: (data: CreateCustomerDTO) => Promise<{ success: boolean; error?: string; data?: Customer }>;
                update: (id: number, data: UpdateCustomerDTO) => Promise<{ success: boolean; error?: string; data?: Customer }>;
                delete: (id: number) => Promise<{ success: boolean }>;
                getClusters: () => Promise<string[]>;
                getByCluster: (cluster: string) => Promise<Customer[]>;
                count: () => Promise<number>;
            };

            bills: {
                calculate: (prev: number, curr: number, discount: number, penalty: number) => Promise<BillCalculation>;
                create: (data: any) => Promise<{ success: boolean; error?: string; message?: string; data?: any }>;
                getByCustomer: (customerId: number) => Promise<Bill[]>;
                getRecent: (limit: number) => Promise<Bill[]>;
                getById: (id: number) => Promise<Bill | null>;
                getLastReading: (customerId: number) => Promise<number>;
                getArrears: (customerId: number) => Promise<number>;
                getBillingPeriod: (date: string) => Promise<string>;
                getDueDate: (billingDate: string) => Promise<string>;
                getByClusterPeriod: (cluster: string, billingDate: string, billingPeriod: string) => Promise<any[]>;
            }

            payments: {
                process: (data: CreatePaymentDTO) => Promise<PaymentResult>;
                getByCustomer: (customerId: number) => Promise<Payment[]>;
                getById: (id: number) => Promise<Payment | null>;
                getAll: (limit?: number) => Promise<PaymentWithCustomer[]>;
                getAllocations: (paymentId: number) => Promise<PaymentAllocation[]>;
                getCustomerBalance: (customerId: number) => Promise<{ totalDue: number; totalPaid: number; balance: number }>;
            };
        };
    }
}

export {};