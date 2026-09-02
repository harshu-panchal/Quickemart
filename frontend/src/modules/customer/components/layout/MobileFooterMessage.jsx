import React, { useState, useEffect } from 'react';
import { useSettings } from '@core/context/SettingsContext';
import { MapPin } from 'lucide-react';
import { customerApi } from '@modules/customer/services/customerApi';

const MobileFooterMessage = () => {
    const { settings } = useSettings();
    const appName = settings?.appName || 'App';
    const [servicedCities, setServicedCities] = useState([]);

    useEffect(() => {
        customerApi.getServicedCities()
            .then((res) => {
                const citiesList = res.data?.results?.cities || res.data?.result?.cities || res.data?.cities || [];
                if (Array.isArray(citiesList) && citiesList.length > 0) {
                    setServicedCities(citiesList);
                }
            })
            .catch((err) => {
                console.error("Failed to load serviced cities on mobile:", err);
            });
    }, []);

    return (
        <div className="md:hidden w-full flex flex-col items-center -mt-8 pt-0 pb-28 px-6 bg-transparent">
            <div className="w-full flex flex-col">
                {/* Services in Cities Section (Placed ABOVE "India's last minute app") */}
                <div className="w-full mb-6 pb-4 border-b border-slate-200">
                    <div className="flex items-center gap-1.5 mb-3 text-slate-500 font-bold text-xs uppercase tracking-wider">
                        <MapPin className="h-3.5 w-3.5 text-brand-600" />
                        <span>Services in Cities</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {(servicedCities.length > 0 ? servicedCities : ['Indore', 'Udaipur']).map((city, idx) => (
                            <span
                                key={idx}
                                className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-full shadow-xs"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                {city}
                            </span>
                        ))}
                    </div>
                </div>

                <h2 className="text-[38px] leading-[1.1] font-black text-slate-300 tracking-tight text-left">
                    India's last<br />minute app <span className="text-red-500">❤️</span>
                </h2>

                <div className="w-full h-[1px] bg-slate-200 mt-6 mb-4"></div>

                <div className="text-slate-300 font-black text-2xl tracking-tighter text-left">
                    {appName}
                </div>
            </div>
        </div>
    );
};

export default MobileFooterMessage;
