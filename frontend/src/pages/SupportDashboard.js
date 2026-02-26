import React from 'react';
import { useLanguage } from '../utils/LanguageContext';

function SupportDashboard() {
  const { language } = useLanguage();
  
  const messages = {
    he: {
      title: 'מודול תמיכה - בקרוב!',
      subtitle: 'אנחנו עובדים קשה כדי להביא לכם את מודול התמיכה המלא',
      features: 'תכונות עתידיות:',
      list: [
        'ניהול פניות לקוחות',
        'מערכת כרטוסים (Tickets)',
        'מעקב אחר תקלות',
        'ניהול SLA',
        'דוחות ביצועים'
      ]
    },
    en: {
      title: 'Support Module - Coming Soon!',
      subtitle: 'We are working hard to bring you the complete support module',
      features: 'Future features:',
      list: [
        'Customer inquiries management',
        'Ticketing system',
        'Issue tracking',
        'SLA management',
        'Performance reports'
      ]
    },
    pt: {
      title: 'Módulo de Suporte - Em Breve!',
      subtitle: 'Estamos trabalhando duro para trazer o módulo de suporte completo',
      features: 'Recursos futuros:',
      list: [
        'Gestão de consultas de clientes',
        'Sistema de tickets',
        'Rastreamento de problemas',
        'Gestão de SLA',
        'Relatórios de desempenho'
      ]
    }
  };

  const t = messages[language] || messages.en;

  return (
    <div className="card" style={{ maxWidth: '800px', margin: '2rem auto', textAlign: 'center' }}>
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚀</div>
      <h2 style={{ color: '#2196F3', marginBottom: '1rem' }}>{t.title}</h2>
      <p style={{ fontSize: '1.1rem', color: '#666', marginBottom: '2rem' }}>{t.subtitle}</p>
      
      <div style={{ textAlign: language === 'he' ? 'right' : 'left', maxWidth: '600px', margin: '0 auto' }}>
        <h3 style={{ color: '#333', marginBottom: '1rem' }}>{t.features}</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {t.list.map((item, idx) => (
            <li key={idx} style={{ 
              padding: '0.5rem 0', 
              borderBottom: '1px solid #eee',
              fontSize: '1rem',
              color: '#555'
            }}>
              ✅ {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default SupportDashboard;
