'use client';

import React from 'react';
import { formatMoney, formatDateTime, getOrderStatusBadge } from '@/lib/formatters';
import { RentalOrderItem } from './RentalOrderTable';

interface RentalDetailModalProps {
  order: RentalOrderItem | null;
  isOpen: boolean;
  onClose: () => void;
  onPrint: (order: RentalOrderItem) => void;
  statusLabel?: string;
  missingAmounts?: { deposit: boolean; total: boolean };
}

export const RentalDetailModal: React.FC<RentalDetailModalProps> = ({
  order,
  isOpen,
  onClose,
  onPrint,
  statusLabel,
  missingAmounts,
}) => {
  if (!isOpen || !order) return null;

  const badge = getOrderStatusBadge(order.status);

  return (
    <div className="modal fade show d-block" tabIndex={-1} role="dialog" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="modal-dialog modal-lg modal-dialog-scrollable" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <div>
              <h5 className="modal-title font-weight-bold mb-1">
                Chi tiết hợp đồng: {order.contract_number}
              </h5>
              <span className={`badge ${badge.badgeClass}`}>{statusLabel || badge.label}</span>
            </div>
            <button type="button" className="close" onClick={onClose} aria-label="Đóng">
              <span aria-hidden="true">&times;</span>
            </button>
          </div>

          <div className="modal-body">
            {/* Thông tin chung */}
            <div className="row mb-4">
              <div className="col-md-6 mb-3">
                <div className="card card-body bg-light h-100">
                  <h6 className="font-weight-bold text-uppercase font-size-xs text-muted mb-2">
                    Thông tin khách hàng
                  </h6>
                  <div className="font-weight-bold font-size-lg">{order.customer?.name || 'Khách vãng lai'}</div>
                  <div>SĐT: <strong>{order.customer?.phone || '--'}</strong></div>
                  <div>Cơ sở tiếp nhận: <strong>{order.store?.name || '--'}</strong></div>
                  <div>Ngày tạo đơn: {formatDateTime(order.created_at)}</div>
                </div>
              </div>

              <div className="col-md-6 mb-3">
                <div className="card card-body bg-light h-100">
                  <h6 className="font-weight-bold text-uppercase font-size-xs text-muted mb-2">
                    Thời gian & Thanh toán
                  </h6>
                  <div>Bắt đầu: <strong>{formatDateTime(order.start_date)}</strong></div>
                  <div>Hẹn trả: <strong>{formatDateTime(order.end_date)}</strong></div>
                  <div className="mt-2 pt-2 border-top">
                    <div>Tiền cọc: <strong className="text-dark">{missingAmounts?.deposit ? '—' : formatMoney(order.deposit_amount)}</strong></div>
                    <div>Tổng tiền thuê: <strong className="text-success font-size-lg">{missingAmounts?.total ? '—' : formatMoney(order.total_amount)}</strong></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Danh sách xe thuê */}
            <h6 className="font-weight-bold mb-2">Xe thuê trong hợp đồng</h6>
            <div className="table-responsive mb-3">
              <table className="table table-bordered table-sm">
                <thead className="thead-light">
                  <tr>
                    <th>Tên xe</th>
                    <th>Biển số</th>
                    <th>Thời gian thuê</th>
                  </tr>
                </thead>
                <tbody>
                  {order.vehicles && order.vehicles.length > 0 ? (
                    order.vehicles.map((v, idx) => (
                      <tr key={idx}>
                        <td className="font-weight-bold">{v.name}</td>
                        <td><span className="badge badge-secondary">{v.license}</span></td>
                        <td>{formatDateTime(order.start_date)} - {formatDateTime(order.end_date)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="text-center text-muted">Chưa có thông tin xe chi tiết</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-outline-primary"
              onClick={() => {
                onClose();
                onPrint(order);
              }}
            >
              <i className="fas fa-print mr-1" /> In hợp đồng
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
