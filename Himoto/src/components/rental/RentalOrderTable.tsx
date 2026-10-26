'use client';

import React from 'react';
import { formatMoney, formatDateTime, getOrderStatusBadge } from '@/lib/formatters';

export interface RentalOrderItem {
  id: number;
  contract_number: string;
  customer?: {
    name: string;
    phone: string;
  };
  store?: {
    name: string;
  };
  vehicles?: {
    name: string;
    license: string;
  }[];
  start_date: string;
  end_date: string;
  deposit_amount: number;
  total_amount: number;
  status: number;
  created_at: string;
}

interface RentalOrderTableProps {
  orders: RentalOrderItem[];
  loading?: boolean;
  total: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onViewOrder: (order: RentalOrderItem) => void;
  onPrintContract: (order: RentalOrderItem) => void;
}

export const RentalOrderTable: React.FC<RentalOrderTableProps> = ({
  orders,
  loading = false,
  total,
  currentPage,
  pageSize,
  onPageChange,
  onViewOrder,
  onPrintContract,
}) => {
  const totalPages = Math.ceil(total / pageSize) || 1;

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="sr-only">Đang tải dữ liệu...</span>
        </div>
        <p className="mt-2 text-muted">Đang tải danh sách hợp đồng...</p>
      </div>
    );
  }

  if (!orders || orders.length === 0) {
    return (
      <div className="text-center py-5 border rounded bg-white">
        <i className="fas fa-file-contract fa-3x text-muted mb-3" />
        <p className="text-muted">Không tìm thấy hợp đồng nào phù hợp với bộ lọc.</p>
      </div>
    );
  }

  return (
    <div className="table-responsive">
      <table className="table table-hover table-striped align-middle">
        <thead className="thead-light">
          <tr>
            <th style={{ width: '60px' }}>#ID</th>
            <th>Số HĐ</th>
            <th>Khách hàng</th>
            <th>Cơ sở</th>
            <th>Xe thuê & Biển số</th>
            <th>Thời gian thuê</th>
            <th>Tiền cọc</th>
            <th>Tổng tiền</th>
            <th>Trạng thái</th>
            <th className="text-right" style={{ width: '120px' }}>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const badge = getOrderStatusBadge(order.status);
            const vehicleInfo = order.vehicles && order.vehicles.length > 0
              ? `${order.vehicles[0].name} (${order.vehicles[0].license})`
              : '--';

            return (
              <tr key={order.id}>
                <td className="font-weight-bold">#{order.id}</td>
                <td>
                  <span className="text-primary font-weight-bold cursor-pointer" onClick={() => onViewOrder(order)}>
                    {order.contract_number}
                  </span>
                </td>
                <td>
                  <div className="font-weight-bold">{order.customer?.name || 'Khách vãng lai'}</div>
                  <div className="text-muted font-size-sm">{order.customer?.phone || '--'}</div>
                </td>
                <td>{order.store?.name || '--'}</td>
                <td>
                  <span className="badge badge-light-info">{vehicleInfo}</span>
                </td>
                <td className="font-size-sm">
                  <div>{formatDateTime(order.start_date)}</div>
                  <div className="text-muted">đến {formatDateTime(order.end_date)}</div>
                </td>
                <td className="font-weight-bold">{formatMoney(order.deposit_amount)}</td>
                <td className="font-weight-bold text-success">{formatMoney(order.total_amount)}</td>
                <td>
                  <span className={`badge ${badge.badgeClass}`}>{badge.label}</span>
                </td>
                <td className="text-right">
                  <div className="btn-group btn-group-sm">
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      onClick={() => onViewOrder(order)}
                      title="Xem chi tiết"
                    >
                      <i className="fas fa-eye" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-info"
                      onClick={() => onPrintContract(order)}
                      title="In hợp đồng"
                    >
                      <i className="fas fa-print" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="d-flex justify-content-between align-items-center mt-3">
          <div className="text-muted font-size-sm">
            Hiển thị {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, total)} trên tổng số {total} hợp đồng
          </div>
          <ul className="pagination mb-0">
            <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
              <button className="page-link" onClick={() => onPageChange(currentPage - 1)}>
                «
              </button>
            </li>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <li key={p} className={`page-item ${p === currentPage ? 'active' : ''}`}>
                <button className="page-link" onClick={() => onPageChange(p)}>
                  {p}
                </button>
              </li>
            ))}
            <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
              <button className="page-link" onClick={() => onPageChange(currentPage + 1)}>
                »
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};
