import { useState, useEffect } from 'react'
import { Lock, Key, CheckCircle, Copy, AlertTriangle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { showToast } from '../hooks/usePerformance'
import './Activation.css' // Import custom CSS

export default function Activation() {
    const navigate = useNavigate()
    const [machineId, setMachineId] = useState('LOADING...')
    const [licenseKey, setLicenseKey] = useState('')
    const [loading, setLoading] = useState(true)
    const [activating, setActivating] = useState(false)
    const [error, setError] = useState(null)

    useEffect(() => {
        checkStatus();
    }, []);

    const checkStatus = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/system/status');
            const data = await res.json();

            if (data.valid) {
                navigate('/');
                return;
            }

            setMachineId(data.machineId || 'UNKNOWN');
        } catch (err) {
            console.error(err);
            setError('فشل الاتصال بالخادم');
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(machineId);
        showToast('تم نسخ كود الجهاز', 'success');
    }

    const handleActivate = async (e) => {
        e.preventDefault();
        setActivating(true);
        setError(null);

        try {
            const res = await fetch('http://localhost:3001/api/system/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ licenseKey })
            });

            const data = await res.json();

            if (res.ok) {
                showToast('تم التفعيل بنجاح! جاري التشغيل...', 'success');
                setTimeout(() => {
                    window.location.reload(); // Refresh to clear state and redirect
                }, 1500);
            } else {
                setError(data.error || 'كود التفعيل غير صحيح');
                showToast('كود التفعيل غير صحيح', 'error');
            }
        } catch (err) {
            setError('حدث خطأ أثناء التفعيل');
        } finally {
            setActivating(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen bg-neutral-950 text-white">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            </div>
        )
    }

    return (
        <div className="activation-container" dir="rtl">

            <div className="activation-card">

                {/* Header */}
                <div className="activation-header">
                    <div className="activation-icon-wrapper">
                        <Key className="activation-icon" size={32} />
                    </div>
                    <h1 className="activation-title">تفعيل النظام</h1>
                    <p className="activation-subtitle">هذه النسخة محمية وتتطلب تفعيل للعمل على هذا الجهاز</p>
                </div>

                <div className="activation-body">

                    {/* Machine ID Section */}
                    <div className="activation-field-group">
                        <label className="activation-label">كود الجهاز (Machine ID)</label>
                        <div className="activation-machine-id-wrapper">
                            <code className="activation-machine-id-code">
                                {machineId}
                            </code>
                            <button
                                onClick={handleCopy}
                                className="activation-copy-btn"
                                title="نسخ الكود"
                            >
                                <Copy size={20} />
                            </button>
                        </div>
                        <p className="activation-hint">
                            <AlertTriangle size={12} />
                            أرسل هذا الكود للمطور للحصول على مفتاح التفعيل
                        </p>
                    </div>

                    <div className="activation-divider"></div>

                    {/* Activation Form */}
                    <form onSubmit={handleActivate} className="space-y-4">
                        <div className="activation-field-group">
                            <label className="activation-label">مفتاح التفعيل (License Key)</label>
                            <input
                                type="text"
                                value={licenseKey}
                                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                                placeholder="XXXX-XXXX-XXXX-XXXX"
                                className="activation-input"
                                dir="ltr"
                            />
                        </div>

                        {error && (
                            <div className="activation-error">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={activating || !licenseKey}
                            className="activation-submit-btn"
                        >
                            {activating ? (
                                <>جاري التفعيل...</>
                            ) : (
                                <>
                                    <CheckCircle size={20} />
                                    تفعيل البرنامج

                                </>
                            )}
                        </button>
                    </form>
                </div>

                <div className="activation-footer">
                    <p className="activation-footer-text">
                        Restaurant POS System v2.0 &copy; 2026
                    </p>
                </div>

            </div>
        </div>
    )
}
