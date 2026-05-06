import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createColumnHelper, useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, getPaginationRowModel, flexRender, SortingState, ColumnFiltersState } from '@tanstack/react-table';
import { FaUsersViewfinder } from "react-icons/fa6";
import { MdSaveAlt, MdClose } from "react-icons/md";

interface Customer {
    id: number;
    cluster: string;
    meter_number: string;
    customer_name: string;
}

interface ClusterCustomer {
    id: string;
    customer_id: number;
    customer_name: string;
    meter_number: string;
    previous_reading: number;
    current_reading: string | number;
    usage: number;
    discount: string;
    penalty: string;
    arrears: number;
    grossAmount: number;
    netAmount: number;
    totalDue: number;
    isCalculated: boolean;
    cluster: string;
}

interface GenerateBillModalProps {
    isOpen: boolean;
    onClose: () => void;
    customers: Customer[];
    clusters: string[];
    onSave: () => void;
}

const GenerateBillModal: React.FC<GenerateBillModalProps> = ({
    isOpen,
    onClose,
    customers,
    clusters,
    onSave,
}) => {
    const [selectedCluster, setSelectedCluster] = useState('');
    const [clusterCustomers, setClusterCustomers] = useState<ClusterCustomer[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Date controls
    const today = new Date().toISOString().split('T')[0];
    const [billingDate, setBillingDate] = useState(today);
    const [dueDate, setDueDate] = useState(today);
    const [billingPeriod, setBillingPeriod] = useState('Monthly');

    // Table state
    const [sorting, setSorting] = useState<SortingState>([]);
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
    const [globalFilter, setGlobalFilter] = useState('');

    // Refs for tracking calculations (FIX 1 & 2)
    const clusterCustomersRef = useRef<ClusterCustomer[]>([]);
    const pendingCalculationRef = useRef<Set<string>>(new Set());
    const calculationInProgressRef = useRef(false);

    // Keep ref in sync with state
    useEffect(() => {
        clusterCustomersRef.current = clusterCustomers;
    }, [clusterCustomers]);

    // Auto-recalculate when rows are marked as pending (FIX 1)
    useEffect(() => {
        const processPendingCalculations = async () => {
            if (calculationInProgressRef.current) return;

            const pendingIds = Array.from(pendingCalculationRef.current);
            if (pendingIds.length === 0) return;

            calculationInProgressRef.current = true;

            for (const rowId of pendingIds) {
                const row = clusterCustomersRef.current.find(c => c.id === rowId);
                if (!row) continue;

                const prevReading = row.previous_reading || 0;
                const currentReading = parseFloat(row.current_reading?.toString() || '0');
                const discount = parseFloat(row.discount?.toString() || '0');
                const penalty = parseFloat(row.penalty?.toString() || '0');
                const arrears = row.arrears || 0;

                if (!row.current_reading || currentReading <= prevReading) {
                    setClusterCustomers(prev =>
                        prev.map(c =>
                            c.id === rowId
                                ? { ...c, usage: 0, grossAmount: 0, netAmount: 0, totalDue: 0, isCalculated: true }
                                : c
                        )
                    );
                    pendingCalculationRef.current.delete(rowId);
                    continue;
                }

                try {
                    const result = await window.electronAPI.bills.calculate(
                        prevReading,
                        currentReading,
                        discount,
                        penalty
                    );

                    const totalDue = result.totalDue + arrears;

                    setClusterCustomers(prev =>
                        prev.map(c =>
                            c.id === rowId
                                ? {
                                    ...c,
                                    usage: result.usage,
                                    grossAmount: result.grossAmount,
                                    netAmount: result.netAmount,
                                    totalDue: totalDue,
                                    isCalculated: true,
                                }
                                : c
                        )
                    );
                } catch (error) {
                    console.error('Error auto-calculating bill:', error);
                }

                pendingCalculationRef.current.delete(rowId);
            }

            calculationInProgressRef.current = false;
        };

        const timeoutId = setTimeout(processPendingCalculations, 500);
        return () => clearTimeout(timeoutId);
    }, [clusterCustomers.length]);

    const handleClusterSelect = async (clusterLetter: string) => {
        setSelectedCluster(clusterLetter);
        setClusterCustomers([]);
        pendingCalculationRef.current.clear();

        if (!clusterLetter) return;

        const filtered = customers.filter(c => c.cluster.charAt(0) === clusterLetter);

        const entries = await Promise.all(
            filtered.map(async (customer) => {
                try {
                    const lastReading = await window.electronAPI.bills.getLastReading(customer.id);
                    const arrears = await window.electronAPI.bills.getArrears(customer.id);

                    return {
                        id: customer.id.toString(),
                        customer_id: customer.id,
                        customer_name: customer.customer_name,
                        meter_number: customer.meter_number,
                        previous_reading: lastReading,
                        current_reading: '',
                        usage: 0,
                        discount: '0',
                        penalty: '0',
                        arrears: arrears,
                        grossAmount: 0,
                        netAmount: 0,
                        totalDue: 0,
                        isCalculated: false,
                        cluster: customer.cluster,
                    };
                } catch (error) {
                    console.error(`Error loading data for customer ${customer.id}:`, error);
                    return null;
                }
            })
        );

        setClusterCustomers(entries.filter(Boolean) as ClusterCustomer[]);
    };

    // FIX 2: calculateBillForRow using ref instead of stale state
    const calculateBillForRow = useCallback(async (
        rowId: string,
        currentReading?: string,
        discount?: string,
        penalty?: string
    ) => {
        const row = clusterCustomersRef.current.find(c => c.id === rowId);
        if (!row) return;

        const finalCurrentReading = currentReading || row.current_reading?.toString() || '0';
        const finalDiscount = discount || row.discount?.toString() || '0';
        const finalPenalty = penalty || row.penalty?.toString() || '0';
        const finalArrears = row.arrears || 0;
        const finalPrevReading = row.previous_reading || 0;

        if (!finalCurrentReading || parseFloat(finalCurrentReading) <= finalPrevReading) {
            setMessage({ type: 'error', text: 'Current reading must be greater than previous reading' });
            return;
        }

        try {
            const result = await window.electronAPI.bills.calculate(
                finalPrevReading,
                parseFloat(finalCurrentReading),
                parseFloat(finalDiscount) || 0,
                parseFloat(finalPenalty) || 0
            );

            const totalDue = result.totalDue + finalArrears;

            setClusterCustomers(prev =>
                prev.map(customer =>
                    customer.id === rowId
                        ? {
                            ...customer,
                            usage: result.usage,
                            grossAmount: result.grossAmount,
                            netAmount: result.netAmount,
                            totalDue: totalDue,
                            isCalculated: true,
                        }
                        : customer
                )
            );
        } catch (error) {
            console.error('Error calculating bill:', error);
            setMessage({ type: 'error', text: 'Failed to calculate bill' });
        }
    }, []);

    // FIX 3: saveAllBills with duplicate check and confirmation
    const saveAllBills = async () => {
        const billsToSave = clusterCustomers.filter(c => c.isCalculated);

        if (billsToSave.length === 0) {
            setMessage({ type: 'error', text: 'No calculated bills to save' });
            return;
        }

        if (!billingDate) {
            setMessage({ type: 'error', text: 'Please select a billing date' });
            return;
        }
        if (!dueDate) {
            setMessage({ type: 'error', text: 'Please select a due date' });
            return;
        }

        // Check for existing bills in this cluster + period
        try {
            const existingBills = await window.electronAPI.bills.getByClusterPeriod(
                selectedCluster,
                billingDate,
                billingPeriod
            );

            if (existingBills && existingBills.length > 0) {
                const confirmed = window.confirm(
                    `⚠️ ${existingBills.length} bill(s) already exist for Cluster ${selectedCluster} in ${billingPeriod} period (${billingDate}).\n\n` +
                    `Do you want to proceed and create ${billsToSave.length} new bill(s)?\n\n` +
                    `This may result in duplicate bills.`
                );
                if (!confirmed) return;
            } else {
                const confirmed = window.confirm(
                    `Are you sure you want to save ${billsToSave.length} bill(s) for Cluster ${selectedCluster}?\n\n` +
                    `Billing Date: ${billingDate}\nDue Date: ${dueDate}\nPeriod: ${billingPeriod}`
                );
                if (!confirmed) return;
            }
        } catch (error) {
            // If the API doesn't exist yet, show a simple confirm
            const confirmed = window.confirm(
                `Save ${billsToSave.length} bill(s) for Cluster ${selectedCluster}?`
            );
            if (!confirmed) return;
        }

        setLoading(true);

        let successCount = 0;
        let errorCount = 0;

        for (const bill of billsToSave) {
            try {
                const result = await window.electronAPI.bills.create({
                    customer_id: bill.customer_id,
                    previous_reading: bill.previous_reading,
                    current_reading: parseFloat(bill.current_reading.toString()),
                    discount: parseFloat(bill.discount) || 0,
                    penalty: parseFloat(bill.penalty) || 0,
                    billing_date: billingDate,
                    billing_period: billingPeriod,
                    due_date: dueDate,
                });

                if (result.success) {
                    successCount++;
                } else {
                    errorCount++;
                }
            } catch (error) {
                errorCount++;
                console.error('Error saving bill:', error);
            }
        }

        setMessage({
            type: successCount > 0 ? 'success' : 'error',
            text: `Saved ${successCount} bill(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
        });

        if (successCount > 0) {
            onSave();
            setTimeout(() => {
                onClose();
            }, 1500);
        }

        setLoading(false);
    };

    const formatCurrency = (amount: number) => `₱ ${amount.toFixed(2)}`;

    const columnHelper = createColumnHelper<ClusterCustomer>();

    const columns = useMemo(() => [
        columnHelper.accessor('cluster', {
            header: 'Cluster',
            size: 80,
            minSize: 60,
        }),
        columnHelper.accessor('customer_name', {
            header: 'Customer Name',
            size: 180,
            minSize: 120,
        }),
        columnHelper.accessor('meter_number', {
            header: 'Meter Number',
            size: 180,
            minSize: 100,
        }),
        columnHelper.accessor('previous_reading', {
            header: 'Previous Reading',
            size: 100,
            minSize: 110,
            cell: info => {
                const rowId = info.row.original.id;
                const value = info.getValue();

                return (
                    <input
                        type="number"
                        className="table-input"
                        value={value || ''}
                        onChange={(e) => {
                            const newValue = parseFloat(e.target.value) || 0;
                            setClusterCustomers(prev =>
                                prev.map(customer =>
                                    customer.id === rowId
                                        ? { ...customer, previous_reading: newValue, isCalculated: false }
                                        : customer
                                )
                            );
                            pendingCalculationRef.current.add(rowId);
                        }}
                        placeholder="0"
                        onClick={(e) => e.stopPropagation()}
                        style={value === 0 ? { background: '#ffffff', borderColor: '#ffffff' } : {}}
                        title={value === 0 ? "No previous reading found. You can enter it manually." : "Auto-fetched from last bill. You can edit if needed."}
                    />
                );
            },
        }),
        columnHelper.accessor('current_reading', {
            header: 'Current Reading',
            size: 140,
            minSize: 110,
            cell: info => {
                const rowId = info.row.original.id;

                return (
                    <input
                        type="number"
                        className="table-input"
                        value={info.getValue() || ''}
                        onChange={(e) => {
                            const newValue = e.target.value;
                            setClusterCustomers(prev =>
                                prev.map(customer =>
                                    customer.id === rowId
                                        ? { ...customer, current_reading: newValue, isCalculated: false }
                                        : customer
                                )
                            );
                            pendingCalculationRef.current.add(rowId);
                        }}
                        placeholder="0"
                        onClick={(e) => e.stopPropagation()}
                    />
                );
            },
        }),
        columnHelper.accessor('discount', {
            header: 'Discount (cu.m)',
            size: 140,
            minSize: 110,
            cell: info => {
                const rowId = info.row.original.id;

                return (
                    <input
                        type="number"
                        className="table-input"
                        value={info.getValue() || ''}
                        onChange={(e) => {
                            const newValue = e.target.value;
                            setClusterCustomers(prev =>
                                prev.map(customer =>
                                    customer.id === rowId
                                        ? { ...customer, discount: newValue, isCalculated: false }
                                        : customer
                                )
                            );
                            pendingCalculationRef.current.add(rowId);
                        }}
                        placeholder="0"
                        onClick={(e) => e.stopPropagation()}
                    />
                );
            },
        }),
        columnHelper.accessor('penalty', {
            header: 'Penalty (₱)',
            size: 120,
            minSize: 90,
            cell: info => {
                const rowId = info.row.original.id;

                return (
                    <input
                        type="number"
                        className="table-input"
                        value={info.getValue() || ''}
                        onChange={(e) => {
                            const newValue = e.target.value;
                            setClusterCustomers(prev =>
                                prev.map(customer =>
                                    customer.id === rowId
                                        ? { ...customer, penalty: newValue, isCalculated: false }
                                        : customer
                                )
                            );
                            pendingCalculationRef.current.add(rowId);
                        }}
                        placeholder="0"
                        onClick={(e) => e.stopPropagation()}
                    />
                );
            },
        }),
        columnHelper.accessor('arrears', {
            header: 'Arrears',
            size: 100,
            minSize: 80,
            cell: info => formatCurrency(info.getValue()),
        }),
        columnHelper.accessor('totalDue', {
            header: 'Total Due',
            size: 120,
            minSize: 100,
            cell: info => {
                const value = info.getValue();
                return value > 0 ? (
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{formatCurrency(value)}</span>
                ) : (
                    <span style={{ color: '#9ca3af' }}>—</span>
                );
            },
        }),
    ], []);

    const table = useReactTable({
        data: clusterCustomers,
        columns,
        state: { sorting, columnFilters, globalFilter },
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        enableColumnResizing: true,
        columnResizeMode: 'onChange',
    });

    if (!isOpen) return null;

    return (
        <div
            className="modal-overlay"
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
        >
            <div className="modal-container modal-container-wide" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="modal-header-left">
                        <h2 className="modal-title">Generate Bills</h2>
                    </div>
                    <button
                        className="modal-close-btn"
                        onClick={onClose}
                        title="Close"
                    >
                        <MdClose />
                    </button>
                </div>

                <div className="modal-body">
                    {message && (
                        <div className={`message-toast ${message.type}`}>
                            <span>{message.text}</span>
                            <button onClick={() => setMessage(null)}>×</button>
                        </div>
                    )}

                    <div className="modal-controls-row">
                        <div className="modal-control-group">
                            <label className="modal-label">Billing Date</label>
                            <input
                                type="date"
                                className="modal-date-input"
                                value={billingDate}
                                onChange={(e) => setBillingDate(e.target.value)}
                            />
                        </div>
                        <div className="modal-control-group">
                            <label className="modal-label">Due Date</label>
                            <input
                                type="date"
                                className="modal-date-input"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                            />
                        </div>
                        <div className="modal-control-group">
                            <label className="modal-label">Billing Period</label>
                            <select
                                className="modal-select"
                                value={billingPeriod}
                                onChange={(e) => setBillingPeriod(e.target.value)}
                            >
                                <option value="Monthly">Monthly</option>
                                <option value="Quarterly">Quarterly</option>
                                <option value="Bi-Annual">Bi-Annual</option>
                                <option value="Annual">Annual</option>
                            </select>
                        </div>
                        <div className="modal-control-group modal-control-group-cluster">
                            <label className="modal-label">Select Cluster</label>
                            <select
                                className="modal-select"
                                onChange={(e) => handleClusterSelect(e.target.value)}
                                value={selectedCluster}
                            >
                                <option value="">Choose a Cluster</option>
                                {clusters.map((cluster, index) => (
                                    <option key={index} value={cluster}>
                                        Cluster {cluster}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {selectedCluster && clusterCustomers.length > 0 && (
                        <>
                            <div className="table-container" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                                <div className="table-toolbar">
                                    <input
                                        type="text"
                                        placeholder="Search customers..."
                                        value={globalFilter}
                                        onChange={(e) => setGlobalFilter(e.target.value)}
                                        className="search-input"
                                    />
                                </div>
                                <div className="table-scroll" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                                    <table className="data-table">
                                        <thead>
                                            {table.getHeaderGroups().map(headerGroup => (
                                                <tr key={headerGroup.id}>
                                                    {headerGroup.headers.map(header => (
                                                        <th key={header.id}>
                                                            {header.isPlaceholder
                                                                ? null
                                                                : flexRender(header.column.columnDef.header, header.getContext())}
                                                        </th>
                                                    ))}
                                                </tr>
                                            ))}
                                        </thead>
                                        <tbody>
                                            {table.getRowModel().rows.map(row => (
                                                <tr key={row.id}>
                                                    {row.getVisibleCells().map(cell => (
                                                        <td key={cell.id}>
                                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="pagination-container">
                                    <div className="pagination-info">
                                        Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                                    </div>
                                    <div className="pagination-buttons">
                                        <button
                                            className="pagination-btn"
                                            onClick={() => table.setPageIndex(0)}
                                            disabled={!table.getCanPreviousPage()}
                                        >
                                            ««
                                        </button>
                                        <button
                                            className="pagination-btn"
                                            onClick={() => table.previousPage()}
                                            disabled={!table.getCanPreviousPage()}
                                        >
                                            «
                                        </button>
                                        <button
                                            className="pagination-btn"
                                            onClick={() => table.nextPage()}
                                            disabled={!table.getCanNextPage()}
                                        >
                                            »
                                        </button>
                                        <button
                                            className="pagination-btn"
                                            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                                            disabled={!table.getCanNextPage()}
                                        >
                                            »»
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-actions-buttons">
                                <button
                                    className="btn-save-bulk"
                                    onClick={saveAllBills}
                                    disabled={loading}
                                >
                                    <MdSaveAlt />{loading ? 'Saving...' : 'Save All Bills'}
                                </button>
                            </div>
                        </>
                    )}

                    {!selectedCluster && (
                        <div className="empty-state">
                            <span className="empty-icon"><FaUsersViewfinder /></span>
                            <p>Select a cluster to view customers</p>
                        </div>
                    )}

                    {selectedCluster && clusterCustomers.length === 0 && (
                        <div className="empty-state">
                            <span className="empty-icon"><FaUsersViewfinder /></span>
                            <p>No customers found in Cluster {selectedCluster}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GenerateBillModal;