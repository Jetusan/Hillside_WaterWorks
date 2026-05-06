import React, { useState, useEffect, useMemo, useRef } from 'react';
import GenerateBillModal from './generateBillBtn';
import './billing.css';
import { TbInvoice } from "react-icons/tb";
import { MdOutlineHistory, MdClose } from "react-icons/md";
import { TbFileInvoice } from "react-icons/tb";
import { IoSearchSharp } from "react-icons/io5";
import { PiInvoiceLight } from "react-icons/pi";
import { CiViewList } from "react-icons/ci";
import { IoMdPrint } from "react-icons/io";


interface Customer {
    id: number;
    cluster: string;
    meter_number: string;
    customer_name: string;
}

interface BillCalculation {
    usage: number;
    grossAmount: number;
    netAmount: number;
    totalDue: number;
}

interface Bill {
    id: number;
    invoice_number: string;
    customer_id: number;
    previous_reading: number;
    current_reading: number;
    usage_cubic_meter: number;
    total_amount_due: number;
    amount_paid: number;
    billing_date: string;
    due_date: string;
    status: string;
    customer_name?: string;
    cluster?: string;
    meter_number?: string;
    billing_period?: string;
    created_at?: string;
}

interface ClusterBatchBill {
    id: string;
    cluster: string;
    billingDate: string;
    dueDate: string;
    billingPeriod: string;
    totalAmount: number;
    customerCount: number;
    timestamp: string;
}

interface BatchDetail {
    batchId: string;
    bills: Bill[];
}

const Billing: React.FC = () => {
    // Main states
    const [batchLimit, setBatchLimit] = useState(10);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [allBills, setAllBills] = useState<Bill[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [activeTab, setActiveTab] = useState<'entry' | 'history'>('entry');
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    
    // Table state (for history tab if needed)
    const [sorting, setSorting] = useState<any[]>([]);
    const [globalFilter, setGlobalFilter] = useState('');
    
    // Cluster batch states
    const [clusterBatches, setClusterBatches] = useState<ClusterBatchBill[]>([]);
    const [batchDetailsMap, setBatchDetailsMap] = useState<Map<string, Bill[]>>(new Map());
    const [selectedBatch, setSelectedBatch] = useState<BatchDetail | null>(null);
    const [showBatchDetails, setShowBatchDetails] = useState(false);
    
    const printRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadCustomers();
        loadRecentBills();
        loadClusterBatches();
    }, []);

    const loadCustomers = async () => {
        const data = await window.electronAPI.customers.getAll();
        setCustomers(data);
    };

    const loadRecentBills = async () => {
        const data = await window.electronAPI.bills.getRecent(50);
        setAllBills(data);
    };

    // Load cluster batches - group bills by cluster and date
    // Load cluster batches - group bills by cluster LETTER and date
    const loadClusterBatches = async () => {
        try {
            const data = await window.electronAPI.bills.getRecent(500);
            
            const batchMap = new Map<string, {
                cluster: string;  // Store just the letter (A, B, C, etc.)
                billingDate: string;
                dueDate: string;
                billingPeriod: string;
                totalAmount: number;
                customerCount: number;
                bills: Bill[];
                timestamp: string;
            }>();

            data.forEach((bill: any) => {
                // FIX: Extract first letter of cluster for grouping
                const clusterLetter = bill.cluster?.charAt(0) || bill.cluster;
                const key = `${clusterLetter}-${bill.billing_date}-${bill.billing_period || 'Monthly'}`;
                
                if (!batchMap.has(key)) {
                    batchMap.set(key, {
                        cluster: clusterLetter,  // Store just the letter
                        billingDate: bill.billing_date,
                        dueDate: bill.due_date,
                        billingPeriod: bill.billing_period || 'Monthly',
                        totalAmount: 0,
                        customerCount: 0,
                        bills: [],
                        timestamp: bill.created_at || bill.billing_date,
                    });
                }
                
                const batch = batchMap.get(key)!;
                batch.totalAmount += bill.total_amount_due || 0;
                batch.customerCount += 1;
                batch.bills.push(bill);
                
                if (bill.created_at && bill.created_at > batch.timestamp) {
                    batch.timestamp = bill.created_at;
                }
            });

            const batches: ClusterBatchBill[] = Array.from(batchMap.entries())
                .map(([key, data]) => ({
                    id: key,
                    cluster: data.cluster,
                    billingDate: data.billingDate,
                    dueDate: data.dueDate,
                    billingPeriod: data.billingPeriod,
                    totalAmount: data.totalAmount,
                    customerCount: data.customerCount,
                    timestamp: data.timestamp,
                }))
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .slice(0, 10);

            setClusterBatches(batches);
            
            const detailsMap = new Map<string, Bill[]>();
            batchMap.forEach((data, key) => {
                detailsMap.set(key, data.bills);
            });
            setBatchDetailsMap(detailsMap);
        } catch (error) {
            console.error('Error loading cluster batches:', error);
        }
    };

    // Get unique cluster letters (A, B, C, D, E only)
    const clusters = useMemo(() => {
        const uniqueClusters = [...new Set(customers.map(c => {
            return c.cluster.charAt(0);
        }))];
        return uniqueClusters.sort();
    }, [customers]);

    // Modal handlers
    const handleOpenModal = () => setShowModal(true);
    const handleCloseModal = () => setShowModal(false);

    const formatCurrency = (amount: number) => {
        return `₱ ${amount.toFixed(2)}`;
    };

    const getStatusBadge = (status: string) => {
        const statusConfig: { [key: string]: { label: string; class: string } } = {
            'paid': { label: 'Paid', class: 'status-paid' },
            'pending': { label: 'Pending', class: 'status-pending' },
            'overdue': { label: 'Overdue', class: 'status-overdue' },
            'partial': { label: 'Partial', class: 'status-partial' },
            'unpaid': { label: 'Unpaid', class: 'status-unpaid' }
        };
        const config = statusConfig[status.toLowerCase()] || { label: status, class: 'status-default' };
        return <span className={`status-badge ${config.class}`}>{config.label}</span>;
    };

    // View batch details
    const handleViewBatch = (batchId: string) => {
        const bills = batchDetailsMap.get(batchId) || [];
        setSelectedBatch({ batchId, bills });
        setShowBatchDetails(true);
    };

    // Print batch
    const handlePrintBatch = (batchId: string) => {
        const bills = batchDetailsMap.get(batchId) || [];
        const batch = clusterBatches.find(b => b.id === batchId);
        
        if (!batch) return;
        
        const printWindow = window.open('', '_blank', 'width=900,height=700');
        if (!printWindow) return;
        
        let printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Bill Summary - Cluster ${batch.cluster}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 30px; color: #1e293b; }
                    .header { border-bottom: 2px solid #3b82f6; padding-bottom: 15px; margin-bottom: 20px; }
                    h2 { color: #1e293b; margin-bottom: 5px; }
                    .meta { color: #64748b; font-size: 14px; margin-bottom: 5px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid #e2e8f0; padding: 10px 14px; text-align: left; font-size: 13px; }
                    th { background: #f8fafc; font-weight: 600; color: #374151; }
                    .total-row { font-weight: 700; background: #f0fdf4; }
                    .total-row td { color: #059669; }
                    .print-btn { 
                        padding: 10px 24px; 
                        background: #3b82f6; 
                        color: white; 
                        border: none; 
                        border-radius: 8px; 
                        cursor: pointer; 
                        font-size: 14px;
                        margin-top: 20px;
                    }
                    @media print { 
                        .print-btn { display: none; } 
                        body { padding: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>Billing Summary - Cluster ${batch.cluster}</h2>
                    <div class="meta">Billing Date: ${batch.billingDate}</div>
                    <div class="meta">Due Date: ${batch.dueDate}</div>
                    <div class="meta">Period: ${batch.billingPeriod}</div>
                    <div class="meta">Total Customers: ${batch.customerCount}</div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Customer Name</th>
                            <th>Meter Number</th>
                            <th>Previous</th>
                            <th>Current</th>
                            <th>Usage (m³)</th>
                            <th>Amount Due</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        bills.forEach((bill: any, index: number) => {
            printContent += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${bill.customer_name}</td>
                    <td>${bill.meter_number}</td>
                    <td>${bill.previous_reading}</td>
                    <td>${bill.current_reading}</td>
                    <td>${bill.usage_cubic_meter}</td>
                    <td>₱${(bill.total_amount_due || 0).toFixed(2)}</td>
                </tr>
            `;
        });
        
        printContent += `
                <tr class="total-row">
                    <td colspan="6"><strong>Total Amount</strong></td>
                    <td><strong>₱${batch.totalAmount.toFixed(2)}</strong></td>
                </tr>
            </tbody>
            </table>
            <button class="print-btn" onclick="window.print()">🖨 Print This Page</button>
            </body>
            </html>
        `;
        
        printWindow.document.write(printContent);
        printWindow.document.close();
    };

    const filteredBills = allBills.filter((bill: any) => {
        const searchLower = searchTerm.toLowerCase();
        return (
            bill.invoice_number?.toLowerCase().includes(searchLower) ||
            bill.customer_name?.toLowerCase().includes(searchLower) ||
            bill.cluster?.toLowerCase().includes(searchLower) ||
            bill.meter_number?.toLowerCase().includes(searchLower)
        );
    });

    return (
        <div className="billing-container">
            <div className="billing-content-wrapper">
                {/* Header Section */}
                <div className="billing-header">
                    <div className="header-left">
                        <h1 className="billing-title">Billing Management</h1>
                        <p className="billing-subtitle">
                            Generate and manage customer water bills
                        </p>
                    </div>
                </div>
                
                {/* Gradient Divider */}
                <div className="gradient-divider"></div>
                
                {/* Message Toast */}
                {message && (
                    <div className={`message-toast ${message.type}`}>
                        <span className="message-icon">{message.type === 'success' ? '✅' : '❌'}</span>
                        <span className="message-text">{message.text}</span>
                        <button className="message-close" onClick={() => setMessage(null)}>×</button>
                    </div>
                )}
                
                {/* Tabs */}
                <div className="tabs-container">
                    <button 
                        className={`tab-button ${activeTab === 'entry' ? 'active' : ''}`}
                        onClick={() => setActiveTab('entry')}
                    >
                        <span className="tab-icon"><TbInvoice /></span>
                        Bill Entry
                    </button>
                    <button 
                        className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
                        onClick={() => setActiveTab('history')}
                    >
                        <span className="tab-icon"><MdOutlineHistory /></span>
                        Billing History
                    </button>
                </div>

                {activeTab === 'entry' ? (
                    /* Bill Entry Tab */
                    <div className="bill-entry-section">
                        <div className="entry-actions">
                            <button 
                                className="btn-generate-bill"
                                onClick={handleOpenModal}
                            >
                                <span><TbFileInvoice /></span> Generate Bill
                            </button>
                        </div>

                        {/* Recently Generated Bills - Grouped by Cluster */}
                        {clusterBatches.length > 0 ? (
                            <div className="recent-bills-section">
                                <div className="recent-bills-header">
                                    <h3 className="section-title">
                                        <span className="recent-icon">📋</span>
                                        Recently Generated Bills
                                    </h3>
                                    <button 
                                        className="btn-view-all"
                                        onClick={() => setActiveTab('history')}
                                    >
                                        View All History
                                    </button>
                                </div>

                                {/* Batch Summary Table */}
                                <div className="table-container">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>Cluster</th>
                                                <th>Billing Date</th>
                                                <th>Due Date</th>
                                                <th>Period</th>
                                                <th>Customers</th>
                                                <th>Total Amount</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {clusterBatches.map((batch) => (
                                                <tr key={batch.id} className="batch-row">
                                                    <td>
                                                        <span className="cluster-badge cluster-badge-large">
                                                            Cluster {batch.cluster}
                                                        </span>
                                                    </td>
                                                    <td>{batch.billingDate}</td>
                                                    <td>{batch.dueDate}</td>
                                                    <td>
                                                        <span className="period-badge">{batch.billingPeriod}</span>
                                                    </td>
                                                    <td>
                                                        <span className="customer-count">
                                                            {batch.customerCount} customer{batch.customerCount !== 1 ? 's' : ''}
                                                        </span>
                                                    </td>
                                                    <td className="amount-cell">{formatCurrency(batch.totalAmount)}</td>
                                                    <td>
                                                        <div className="batch-actions">
                                                            <button 
                                                                className="btn-view-batch"
                                                                onClick={() => handleViewBatch(batch.id)}
                                                                title="View Details"
                                                            >
                                                                <CiViewList />
                                                            </button>
                                                            <button 
                                                                className="btn-print-batch"
                                                                onClick={() => handlePrintBatch(batch.id)}
                                                                title="Print Batch"
                                                            >
                                                                <IoMdPrint />
                                                            </button>
                                                        </div>
                                                        {/* Add this after the batch table */}
                                                        {batchLimit < clusterBatches.length && (
                                                            <div style={{ textAlign: 'center', marginTop: '16px' }}>
                                                                <button 
                                                                    className="btn-view-all"
                                                                    onClick={() => setBatchLimit(prev => prev + 10)}
                                                                >
                                                                    Load More Batches ({clusterBatches.length - batchLimit} remaining)
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            /* Empty state when no bills have been generated yet */
                            <div className="entry-info-card">
                                <div className="info-icon"><PiInvoiceLight /></div>
                                <h3>Generate New Bills</h3>
                                <p>Click the "Generate Bill" button above to create new bills for customers by cluster.</p>
                                <p className="entry-hint">Recently generated bill batches will appear here grouped by cluster.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="history-section">
                        <div className="history-header">
                            <h3 className="section-title">All Bills</h3>
                            <div className="search-wrapper">
                                <span className="search-icon"><IoSearchSharp /></span>
                                <input
                                    type="text"
                                    placeholder="Search by invoice, customer, or meter..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="search-input"
                                />
                            </div>
                        </div>
                        
                        {filteredBills.length > 0 ? (
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>Invoice Number</th>
                                            <th>Customer</th>
                                            <th>Cluster</th>
                                            <th>Meter Number</th>
                                            <th>Billing Date</th>
                                            <th>Due Date</th>
                                            <th>Amount</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredBills.map((bill: any) => (
                                            <tr key={bill.id}>
                                                <td className="invoice-number">{bill.invoice_number}</td>
                                                <td>
                                                    <div className="customer-cell">
                                                        <span className="customer-avatar-small">
                                                            {bill.customer_name?.charAt(0).toUpperCase()}
                                                        </span>
                                                        <span>{bill.customer_name}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="cluster-badge">{bill.cluster}</span>
                                                </td>
                                                <td className="meter-cell">{bill.meter_number}</td>
                                                <td>{bill.billing_date}</td>
                                                <td>{bill.due_date}</td>
                                                <td className="amount-cell">{formatCurrency(bill.total_amount_due)}</td>
                                                <td>{getStatusBadge(bill.status)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="empty-state">
                                <span className="empty-icon">📊</span>
                                <p>No bills found</p>
                                <p className="empty-subtitle">Try adjusting your search or generate new bills</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Batch Detail Modal - OUTSIDE the entry/history conditional */}
                {showBatchDetails && selectedBatch && selectedBatch.bills.length > 0 && (
                    <div className="modal-overlay" onClick={() => setShowBatchDetails(false)}>
                        <div className="modal-container modal-container-wide" onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <div className="modal-header-left">
                                    <h2 className="modal-title">
                                        Cluster {selectedBatch.bills[0]?.cluster?.charAt(0) || selectedBatch.bills[0]?.cluster} - Batch Details
                                    </h2>
                                </div>
                                <button 
                                    className="modal-close-btn" 
                                    onClick={() => setShowBatchDetails(false)}
                                    title="Close"
                                >
                                    <MdClose />
                                </button>
                            </div>
                            <div className="modal-body">
                                <div className="batch-info-bar">
                                    <div className="batch-info-item">
                                        <span className="batch-info-label">Billing Date:</span>
                                        <span className="batch-info-value">{selectedBatch.bills[0]?.billing_date}</span>
                                    </div>
                                    <div className="batch-info-item">
                                        <span className="batch-info-label">Due Date:</span>
                                        <span className="batch-info-value">{selectedBatch.bills[0]?.due_date}</span>
                                    </div>
                                    <div className="batch-info-item">
                                        <span className="batch-info-label">Period:</span>
                                        <span className="batch-info-value">{selectedBatch.bills[0]?.billing_period || 'Monthly'}</span>
                                    </div>
                                    <div className="batch-info-item">
                                        <span className="batch-info-label">Customers:</span>
                                        <span className="batch-info-value">{selectedBatch.bills.length}</span>
                                    </div>
                                    <div className="batch-info-item batch-total-item">
                                        <span className="batch-info-label">Total:</span>
                                        <span className="batch-info-value batch-total-amount">
                                            {formatCurrency(
                                                selectedBatch.bills.reduce((sum: number, bill: any) => 
                                                    sum + (bill.total_amount_due || 0), 0
                                                )
                                            )}
                                        </span>
                                    </div>
                                </div>
                                <div className="table-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                                    <div className="table-scroll" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    <th>Customer</th>
                                                    <th>Meter Number</th>
                                                    <th>Previous</th>
                                                    <th>Current</th>
                                                    <th>Usage (m³)</th>
                                                    <th>Amount</th>
                                                    <th>Status</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {selectedBatch.bills.map((bill: any, index: number) => (
                                                    <tr key={bill.id}>
                                                        <td>
                                                            <div className="customer-cell">
                                                                <span className="customer-avatar-small">
                                                                    {bill.customer_name?.charAt(0).toUpperCase()}
                                                                </span>
                                                                <span>{bill.customer_name}</span>
                                                            </div>
                                                        </td>
                                                        <td className="meter-cell">{bill.meter_number}</td>
                                                        <td>{bill.previous_reading}</td>
                                                        <td>{bill.current_reading}</td>
                                                        <td>{bill.usage_cubic_meter}</td>
                                                        <td className="amount-cell">{formatCurrency(bill.total_amount_due)}</td>
                                                        <td>{getStatusBadge(bill.status)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <GenerateBillModal
                    isOpen={showModal}
                    onClose={handleCloseModal}
                    customers={customers}
                    clusters={clusters}
                    onSave={() => {
                        loadRecentBills();
                        loadClusterBatches();
                    }}
                />
            </div>
        </div>
    );
};

export default Billing;