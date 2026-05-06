import { Database } from 'sql.js';
import { Bill, CreateBillDTO, UpdateBillDTO, BillWithCustomer } from '../../../shared/types/bill';
import { calculateBill, generateInvoiceNumber } from '../../utils/billingCalculator';
import { saveDatabase } from '../index';

export class BillRepository {
    constructor(private db: Database) {}

    create(data: CreateBillDTO): Bill | null {
        const calculation = calculateBill(
            data.previous_reading,
            data.current_reading,
            data.discount || 0,
            data.penalty || 0,
            0 // arrears calculated separately
        );
        
        const invoiceNumber = generateInvoiceNumber();
        
        const sql = `
            INSERT INTO bills (
                customer_id, invoice_number, previous_reading, current_reading,
                usage_cubic_meter, gross_amount, discount, net_amount, penalty,
                arrears, total_amount_due, billing_date, billing_period, due_date, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Unpaid')
        `;
        
        this.db.run(sql, [
            data.customer_id,
            invoiceNumber,
            data.previous_reading,
            data.current_reading,
            calculation.usage,
            calculation.grossAmount,
            data.discount || 0,
            calculation.netAmount,
            data.penalty || 0,
            0,
            calculation.totalDue,
            data.billing_date,
            data.billing_period,
            data.due_date
        ]);
        saveDatabase();
        
        return this.findByInvoiceNumber(invoiceNumber);
    }

    findById(id: number): Bill | null {
        const stmt = this.db.prepare('SELECT * FROM bills WHERE id = ?');
        const bill = stmt.getAsObject([id]) as any;
        stmt.free();
        return bill.id ? this.toBill(bill) : null;
    }

    findByInvoiceNumber(invoiceNumber: string): Bill | null {
        const stmt = this.db.prepare('SELECT * FROM bills WHERE invoice_number = ?');
        const bill = stmt.getAsObject([invoiceNumber]) as any;
        stmt.free();
        return bill.id ? this.toBill(bill) : null;
    }

    findByClusterPeriod(cluster: string, billingDate: string, billingPeriod: string): Bill[] {
        const stmt = this.db.prepare(`
            SELECT 
                b.*,
                c.cluster,
                c.meter_number,
                c.customer_name
            FROM bills b
            JOIN customers c ON b.customer_id = c.id
            WHERE c.cluster LIKE ? 
            AND b.billing_date = ? 
            AND b.billing_period = ?
            ORDER BY c.customer_name
        `);
        
        const clusterLetter = cluster.charAt(0) + '%';
        const bills: any[] = [];
        stmt.bind([clusterLetter, billingDate, billingPeriod]);
        
        while (stmt.step()) {
            const row = stmt.getAsObject() as any;
            bills.push({
                ...this.toBill(row),
                cluster: row.cluster,
                meter_number: row.meter_number,
                customer_name: row.customer_name
            });
        }
        stmt.free();
        
        return bills;
    }

    findByCustomerId(customerId: number): Bill[] {
        const stmt = this.db.prepare(`
            SELECT * FROM bills 
            WHERE customer_id = ? 
            ORDER BY billing_date DESC
        `);
        
        const bills: Bill[] = [];
        stmt.bind([customerId]);
        
        while (stmt.step()) {
            bills.push(this.toBill(stmt.getAsObject() as any));
        }
        stmt.free();
        return bills;
    }

    findAllWithCustomer(): BillWithCustomer[] {
        const stmt = this.db.prepare(`
            SELECT 
                b.*,
                c.cluster,
                c.meter_number,
                c.customer_name
            FROM bills b
            JOIN customers c ON b.customer_id = c.id
            ORDER BY b.billing_date DESC, b.id DESC
            LIMIT 100
        `);
        
        const bills: BillWithCustomer[] = [];
        
        while (stmt.step()) {
            const row = stmt.getAsObject() as any;
            bills.push({
                ...this.toBill(row),
                cluster: row.cluster,
                meter_number: row.meter_number,
                customer_name: row.customer_name
            });
        }
        stmt.free();
        return bills;
    }

    findUnpaidByCustomerId(customerId: number): Bill[] {
        const stmt = this.db.prepare(`
            SELECT * FROM bills 
            WHERE customer_id = ? AND status != 'Paid'
            ORDER BY billing_date ASC
        `);
        
        const bills: Bill[] = [];
        stmt.bind([customerId]);
        
        while (stmt.step()) {
            bills.push(this.toBill(stmt.getAsObject() as any));
        }
        stmt.free();
        return bills;
    }

    updatePayment(id: number, amount: number, status?: 'Unpaid' | 'Partial' | 'Paid'): void {
        if (status) {
            this.db.run(`
                UPDATE bills 
                SET amount_paid = amount_paid + ?,
                    status = ?
                WHERE id = ?
            `, [amount, status, id]);
        } else {
            this.db.run(`
                UPDATE bills 
                SET amount_paid = amount_paid + ?,
                    status = CASE 
                        WHEN amount_paid + ? >= total_amount_due THEN 'Paid'
                        ELSE 'Partial'
                    END
                WHERE id = ?
            `, [amount, amount, id]);
        }

        saveDatabase();
    }

    getCustomerArrears(customerId: number): number {
        const stmt = this.db.prepare(`
            SELECT SUM(total_amount_due) as total_due, SUM(amount_paid) as total_paid
            FROM bills 
            WHERE customer_id = ?
        `);
        const result = stmt.getAsObject([customerId]) as any;
        stmt.free();
        
        console.log('🔴 getCustomerArrears - Query result:', result);
        
        return (result.total_due || 0) - (result.total_paid || 0);
    }

    getLastReading(customerId: number): number {
        const stmt = this.db.prepare(`
            SELECT current_reading 
            FROM bills 
            WHERE customer_id = ? 
            ORDER BY id DESC 
            LIMIT 1
        `);
        const result = stmt.getAsObject([customerId]) as any;
        stmt.free();
        
        console.log('🔴 getLastReading - Query result:', result);
        
        return result.current_reading || 0;
    }

    private toBill(row: any): Bill {
        return {
            id: row.id,
            customer_id: row.customer_id,
            invoice_number: row.invoice_number,
            previous_reading: row.previous_reading,
            current_reading: row.current_reading,
            usage_cubic_meter: row.usage_cubic_meter,
            gross_amount: row.gross_amount,
            discount: row.discount,
            net_amount: row.net_amount,
            penalty: row.penalty,
            arrears: row.arrears,
            total_amount_due: row.total_amount_due,
            amount_paid: row.amount_paid || 0,
            billing_date: row.billing_date,
            billing_period: row.billing_period,
            due_date: row.due_date,
            status: row.status || 'Unpaid',
            created_at: row.created_at
        };
    }
}