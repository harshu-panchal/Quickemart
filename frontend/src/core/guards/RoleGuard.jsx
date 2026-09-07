import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@core/context/AuthContext';

const RoleGuard = ({ children, allowedRoles }) => {
    const { role, isAuthenticated, isLoading, user } = useAuth();

    if (isLoading) {
        return null; // Let ProtectedRoute handle the loading spinner
    }

    const currentRole = user?.role || role;

    if (!isAuthenticated || !currentRole || !allowedRoles.includes(currentRole)) {
        // Redirect to their respective dashboard if they are logged in but trying to access the wrong area
        if (isAuthenticated && currentRole) {
            const redirectPath = (currentRole === 'product' || currentRole === 'admin') ? '/admin' : `/${currentRole}`;
            return <Navigate to={redirectPath} replace />;
        }
        return <Navigate to="/unauthorized" replace />;
    }

    return <>{children}</>;
};

export default RoleGuard;
