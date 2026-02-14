import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px',
          backgroundColor: '#0a0a0a',
          color: '#fff'
        }}>
          <div style={{
            maxWidth: '600px',
            width: '100%',
            padding: '40px',
            backgroundColor: '#1a1a1a',
            borderRadius: '12px',
            border: '1px solid #ef4444',
            direction: 'rtl'
          }}>
            <h1 style={{
              fontSize: '24px',
              fontWeight: 'bold',
              color: '#ef4444',
              marginBottom: '16px',
              textAlign: 'center'
            }}>
              ⚠️ حدث خطأ غير متوقع
            </h1>
            <p style={{
              marginBottom: '24px',
              color: '#94a3b8',
              textAlign: 'center'
            }}>
              نعتذر عن المشكلة. يرجى تحديث الصفحة أو الاتصال بالدعم الفني.
            </p>
            
            {this.state.error && (
              <details style={{
                marginBottom: '24px',
                padding: '16px',
                backgroundColor: '#0a0a0a',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'monospace',
                direction: 'ltr',
                textAlign: 'left'
              }}>
                <summary style={{ cursor: 'pointer', marginBottom: '8px', color: '#f59e0b' }}>
                  تفاصيل الخطأ (للمطورين)
                </summary>
                <pre style={{ overflow: 'auto', color: '#ef4444' }}>
                  {this.state.error.toString()}
                  {'\n\n'}
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#3b82f6',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#2563eb'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#3b82f6'}
              >
                تحديث الصفحة
              </button>
              <button
                onClick={() => window.location.href = '/login'}
                style={{
                  padding: '12px 24px',
                  backgroundColor: '#6b7280',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseOver={(e) => e.target.style.backgroundColor = '#4b5563'}
                onMouseOut={(e) => e.target.style.backgroundColor = '#6b7280'}
              >
                العودة للتسجيل
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
