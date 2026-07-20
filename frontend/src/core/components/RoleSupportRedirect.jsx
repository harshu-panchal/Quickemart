import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@core/context/AuthContext';
import { UserRole } from '@core/constants/roles';
import SupportPage from '../../modules/customer/pages/SupportPage';

const RoleSupportRedirect = () => {
    const { user } = useAuth();
    const role = String(user?.role || '').toLowerCase();

    if (role === UserRole.ADMIN || role === 'admin') {
        return <Navigate to="/admin/support" replace />;
    }
    if (role === UserRole.SELLER || role === 'seller') {
        return <Navigate to="/seller/support" replace />;
    }
    if (role === UserRole.DELIVERY || role === 'delivery' || role === 'driver') {
        return <Navigate to="/delivery/support" replace />;
    }

    return <SupportPage />;
};

export default RoleSupportRedirect;
