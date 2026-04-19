import React, { useState, useEffect, useCallback } from 'react';

function useIsMobile(breakpoint = 600) {
  const [isMobile, setIsMobile] = useState(() => {
    try { return window.innerWidth < breakpoint; } catch { return false; }
  });
  const handler = useCallback(() => setIsMobile(window.innerWidth < breakpoint), [breakpoint]);
  useEffect(() => {
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [handler]);
  return isMobile;
}

const content = {
  en: {
    title: '📖 Support User Guide',
    sections: [
      {
        title: '1. Support Management Screen',
        content: 'The main screen shows all tickets with columns: Ticket #, Customer, Subject, Priority, Status, Date, Actions. Click "Case Management" to open a ticket.'
      },
      {
        title: '2. Case Statuses',
        table: {
          headers: ['Status', 'Meaning'],
          rows: [
            ['Open', 'New case — just created, not yet being handled'],
            ['In Progress', 'Case is being actively worked on'],
            ['Awaiting Customer', 'Waiting for a response from the customer'],
            ['Closed', 'Case fully resolved and closed'],
          ]
        }
      },
      {
        title: '3. Opening a New Case',
        steps: [
          { step: 'Step 1', title: 'Click "Open New Ticket"' },
          { step: 'Step 2', title: 'Select Customer', desc: 'Required' },
          { step: 'Step 3', title: 'Select Product', desc: 'Required — the product related to the issue' },
          { step: 'Step 4', title: 'Enter Subject', desc: 'Required — brief description (max 80 characters)' },
          { step: 'Step 5', title: 'Add Description', desc: 'Detailed explanation of the problem (recommended)' },
          { step: 'Step 6', title: 'Set Priority', desc: 'Low / Medium / High / Urgent' },
          { step: 'Step 7', title: 'Set Status', desc: 'Usually "Open" for new cases' },
          { step: 'Step 8', title: 'Click "Save"', desc: 'Ticket is created with a unique TKT number' },
        ]
      },
      {
        title: '4. Documenting Customer Interactions',
        warning: 'Every interaction with the customer MUST be documented in the case. This includes phone calls, emails, WhatsApp messages, and any other communication. A case without documentation is incomplete.',
        intro: 'How to add a comment:',
        steps: [
          { step: 'Step 1', title: 'Open the case via "Case Management"' },
          { step: 'Step 2', title: 'Scroll to "ADD COMMENT"' },
          { step: 'Step 3', title: 'Type the interaction details', desc: 'e.g. "Called customer — confirmed the issue. Will send replacement."' },
          { step: 'Step 4', title: 'Click "Save Comment"' },
        ],
        note: 'If the customer sends photos of a defective product, upload them immediately using the "Upload Image" field in Ticket Details (up to 5 images). Photos are critical evidence.'
      },
      {
        title: '5. Setting Status to "Awaiting Customer"',
        intro: 'When you contact the customer and are waiting for their response:',
        steps: [
          { step: 'Step 1', title: 'Change Status to "Awaiting Customer"', desc: 'A dialog box opens automatically' },
          { step: 'Step 2', title: 'Select Communication Channel', desc: 'Phone / Email / SMS — required' },
          { step: 'Step 3', title: 'Enter Note', desc: 'What you requested from the customer — e.g. "Requested photo of damaged item"' },
          { step: 'Step 4', title: 'Set Expected Reply', desc: 'Optional — date/time when customer is expected to respond' },
          { step: 'Step 5', title: 'Click "Confirm"' },
        ],
        warning: 'When the customer responds, change the status back to "In Progress" immediately.'
      },
      {
        title: '6. Sending a Product from a Case',
        intro: 'When a defective product needs to be replaced:',
        steps: [
          { step: 'Step 1', title: 'Click "Send Product"', desc: 'A dispatch request is sent to the Warehouse' },
          { step: 'Step 2', title: 'Warehouse receives an alert', desc: 'The warehouse team prepares and ships the product' },
          { step: 'Step 3', title: 'Warehouse confirms dispatch', desc: 'An automatic alert is sent back to Support' },
          { step: 'Step 4', title: 'Support receives the alert', desc: 'Shows product name, quantity, delivery note reference, and date' },
          { step: 'Step 5', title: 'Acknowledge the alert', desc: 'Confirm receipt of the dispatch notification in the case' },
        ],
        tip: 'The entire process is logged automatically in the History / Timeline. If the customer later confirms receipt, add a comment documenting it.'
      },
      {
        title: '7. Closing a Case',
        steps: [
          { step: 'Step 1', title: 'Verify the issue is fully resolved' },
          { step: 'Step 2', title: 'Add a resolution comment', desc: 'e.g. "Issue resolved — replacement unit shipped and confirmed received."' },
          { step: 'Step 3', title: 'Change Status to "Closed"' },
          { step: 'Step 4', title: 'Click "Save"' },
        ],
        warning: 'Do not close a case without a resolution comment. Every closed case must have a clear record of how it was resolved.'
      },
      {
        title: '8. Priority Guidelines',
        table: {
          headers: ['Priority', 'When to use', 'Expected response'],
          rows: [
            ['Low', 'General inquiry, no urgency', 'Within 3 business days'],
            ['Medium', 'Standard issue requiring attention', 'Within 1 business day'],
            ['High', 'Significant impact on customer', 'Within a few hours'],
            ['Urgent', 'Critical failure, customer cannot operate', 'Immediately'],
          ]
        }
      }
    ]
  },
  pt: {
    title: '📖 Guia do Utilizador — Suporte',
    sections: [
      {
        title: '1. Ecrã de Gestão de Suporte',
        content: 'O ecrã principal mostra todos os tickets com as colunas: Ticket #, Cliente, Assunto, Prioridade, Estado, Data, Ações. Clique em "Case Management" para abrir um ticket.'
      },
      {
        title: '2. Estados dos Casos',
        table: {
          headers: ['Estado', 'Significado'],
          rows: [
            ['Open', 'Novo caso — recém criado, ainda não tratado'],
            ['In Progress', 'Caso em tratamento ativo'],
            ['Awaiting Customer', 'À espera de resposta do cliente'],
            ['Closed', 'Caso totalmente resolvido e fechado'],
          ]
        }
      },
      {
        title: '3. Abrir um Novo Caso',
        steps: [
          { step: 'Passo 1', title: 'Clique em "Open New Ticket"' },
          { step: 'Passo 2', title: 'Selecionar Cliente', desc: 'Obrigatório' },
          { step: 'Passo 3', title: 'Selecionar Produto', desc: 'Obrigatório — o produto relacionado com o problema' },
          { step: 'Passo 4', title: 'Inserir Assunto', desc: 'Obrigatório — descrição breve (máx. 80 caracteres)' },
          { step: 'Passo 5', title: 'Adicionar Descrição', desc: 'Explicação detalhada do problema (recomendado)' },
          { step: 'Passo 6', title: 'Definir Prioridade', desc: 'Baixa / Média / Alta / Urgente' },
          { step: 'Passo 7', title: 'Definir Estado', desc: 'Normalmente "Open" para novos casos' },
          { step: 'Passo 8', title: 'Clique em "Save"', desc: 'Ticket criado com número único TKT' },
        ]
      },
      {
        title: '4. Documentar Interações com o Cliente',
        warning: 'Toda a interação com o cliente DEVE ser documentada no caso. Isto inclui chamadas telefónicas, emails, mensagens WhatsApp e qualquer outra comunicação. Um caso sem documentação está incompleto.',
        intro: 'Como adicionar um comentário:',
        steps: [
          { step: 'Passo 1', title: 'Abrir o caso via "Case Management"' },
          { step: 'Passo 2', title: 'Descer até "ADD COMMENT"' },
          { step: 'Passo 3', title: 'Escrever os detalhes da interação', desc: 'ex: "Contactei o cliente — confirmou o problema. Será enviada substituição."' },
          { step: 'Passo 4', title: 'Clique em "Save Comment"' },
        ],
        note: 'Se o cliente enviar fotos de um produto com defeito, carregue-as imediatamente usando o campo "Upload Image" nos detalhes do ticket (máx. 5 imagens). As fotos são evidências críticas.'
      },
      {
        title: '5. Definir Estado para "Awaiting Customer"',
        intro: 'Quando contacta o cliente e está à espera da resposta:',
        steps: [
          { step: 'Passo 1', title: 'Alterar Estado para "Awaiting Customer"', desc: 'Uma caixa de diálogo abre automaticamente' },
          { step: 'Passo 2', title: 'Selecionar Canal de Comunicação', desc: 'Telefone / Email / SMS — obrigatório' },
          { step: 'Passo 3', title: 'Inserir Nota', desc: 'O que pediu ao cliente — ex: "Solicitada foto do produto danificado"' },
          { step: 'Passo 4', title: 'Definir Resposta Esperada', desc: 'Opcional — data/hora prevista para resposta' },
          { step: 'Passo 5', title: 'Clique em "Confirm"' },
        ],
        warning: 'Quando o cliente responder, altere o estado de volta para "In Progress" imediatamente.'
      },
      {
        title: '6. Enviar Produto a partir de um Caso',
        intro: 'Quando um produto com defeito precisa de ser substituído:',
        steps: [
          { step: 'Passo 1', title: 'Clique em "Send Product"', desc: 'Um pedido de expedição é enviado ao Armazém' },
          { step: 'Passo 2', title: 'Armazém recebe alerta', desc: 'A equipa do armazém prepara e expede o produto' },
          { step: 'Passo 3', title: 'Armazém confirma expedição', desc: 'Um alerta automático é enviado de volta ao Suporte' },
          { step: 'Passo 4', title: 'Suporte recebe o alerta', desc: 'Mostra nome do produto, quantidade, referência e data' },
          { step: 'Passo 5', title: 'Confirmar o alerta', desc: 'Confirmar a notificação de expedição no caso' },
        ],
        tip: 'Todo o processo é registado automaticamente no Histórico. Se o cliente confirmar a receção, adicione um comentário a documentar.'
      },
      {
        title: '7. Fechar um Caso',
        steps: [
          { step: 'Passo 1', title: 'Verificar que o problema foi totalmente resolvido' },
          { step: 'Passo 2', title: 'Adicionar comentário de resolução', desc: 'ex: "Problema resolvido — unidade de substituição enviada e receção confirmada."' },
          { step: 'Passo 3', title: 'Alterar Estado para "Closed"' },
          { step: 'Passo 4', title: 'Clique em "Save"' },
        ],
        warning: 'Não feche um caso sem comentário de resolução. Cada caso fechado deve ter um registo claro de como foi resolvido.'
      },
      {
        title: '8. Guia de Prioridades',
        table: {
          headers: ['Prioridade', 'Quando usar', 'Resposta esperada'],
          rows: [
            ['Low', 'Consulta geral, sem urgência', 'Até 3 dias úteis'],
            ['Medium', 'Problema padrão que requer atenção', 'Até 1 dia útil'],
            ['High', 'Impacto significativo no cliente', 'Em poucas horas'],
            ['Urgent', 'Falha crítica, cliente não consegue operar', 'Imediatamente'],
          ]
        }
      }
    ]
  }
};

// ─── Responsive Table ─────────────────────────────────────────────────────────
function ResponsiveTable({ headers, rows, isMobile }) {
  if (isMobile) {
    return (
      <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {rows.map((row, j) => (
          <div key={j} style={{
            border: '1px solid #BBBBBB',
            borderRadius: '8px',
            overflow: 'hidden',
            background: j % 2 === 0 ? '#fff' : '#F7F7F7',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            {headers.map((header, k) => (
              <div key={k} style={{
                display: 'flex',
                borderBottom: k < headers.length - 1 ? '1px solid #e2e8f0' : 'none',
              }}>
                <div style={{
                  background: '#D5E8F0',
                  color: '#1B3A6B',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  padding: '0.45rem 0.7rem',
                  width: '38%',
                  flexShrink: 0,
                  borderRight: '1px solid #BBBBBB',
                  lineHeight: 1.35,
                  display: 'flex',
                  alignItems: 'center',
                }}>
                  {header}
                </div>
                <div style={{
                  padding: '0.45rem 0.7rem',
                  fontSize: '0.85rem',
                  color: '#444',
                  flex: 1,
                  lineHeight: 1.4,
                }}>
                  {row[k]}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem', fontSize: '0.9rem' }}>
      <thead>
        <tr>
          {headers.map((h, j) => (
            <th key={j} style={{ background: '#D5E8F0', color: '#1B3A6B', fontWeight: 700, padding: '0.6rem 0.8rem', textAlign: 'left', border: '1px solid #BBBBBB' }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, j) => (
          <tr key={j}>
            {row.map((cell, k) => (
              <td key={k} style={{ padding: '0.6rem 0.8rem', border: '1px solid #BBBBBB', background: j % 2 === 1 ? '#F7F7F7' : '#fff', color: '#555', verticalAlign: 'top' }}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function SupportGuide() {
  const systemLang = localStorage.getItem('language') || 'en';
  const defaultLang = systemLang === 'pt' ? 'pt' : 'en';
  const [lang, setLang] = useState(defaultLang);
  const isMobile = useIsMobile(600);

  useEffect(() => {
    const l = localStorage.getItem('language') || 'en';
    setLang(l === 'pt' ? 'pt' : 'en');
  }, []);

  const c = content[lang];

  const styles = {
    container: { maxWidth: '860px', margin: '0 auto', padding: isMobile ? '0.75rem' : '2rem', fontFamily: 'Arial, sans-serif', boxSizing: 'border-box' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '3px solid #2E75B6', paddingBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' },
    title: { fontSize: isMobile ? '1.2rem' : '1.8rem', fontWeight: 700, color: '#1B3A6B', margin: 0 },
    langToggle: { display: 'flex', gap: '0.5rem' },
    langBtn: (active) => ({ padding: '0.4rem 1rem', border: '2px solid #2E75B6', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', background: active ? '#2E75B6' : '#fff', color: active ? '#fff' : '#2E75B6', transition: 'all 0.2s' }),
    section: { marginBottom: '1.2rem', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' },
    sectionTitle: { background: '#1B3A6B', color: '#fff', padding: '0.8rem 1.2rem', fontSize: isMobile ? '0.95rem' : '1.05rem', fontWeight: 700, margin: 0 },
    sectionBody: { padding: isMobile ? '0.75rem' : '1.2rem' },
    intro: { color: '#444', marginBottom: '1rem', fontSize: '0.95rem' },
    content: { color: '#444', fontSize: '0.95rem', margin: 0 },
    stepRow: { display: 'flex', gap: '0.8rem', marginBottom: '0.6rem', alignItems: 'flex-start' },
    stepBadge: { background: '#2E75B6', color: '#fff', borderRadius: '6px', padding: '0.2rem 0.6rem', fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap', marginTop: '2px', flexShrink: 0 },
    stepTitle: { fontWeight: 700, color: '#1B3A6B', fontSize: '0.95rem' },
    stepDesc: { color: '#555', fontSize: '0.9rem' },
    tip: { background: '#D4EDDA', borderLeft: '4px solid #1E7E34', borderRadius: '4px', padding: '0.7rem 1rem', marginTop: '1rem', color: '#155724', fontSize: '0.9rem' },
    warning: { background: '#F8D7DA', borderLeft: '4px solid #CC0000', borderRadius: '4px', padding: '0.7rem 1rem', marginTop: '0.5rem', marginBottom: '0.5rem', color: '#721C24', fontSize: '0.9rem' },
    note: { background: '#FFF3CD', borderLeft: '4px solid #FFA500', borderRadius: '4px', padding: '0.7rem 1rem', marginTop: '1rem', color: '#856404', fontSize: '0.9rem' },
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>{c.title}</h1>
        <div style={styles.langToggle}>
          <button style={styles.langBtn(lang === 'en')} onClick={() => setLang('en')}>EN</button>
          <button style={styles.langBtn(lang === 'pt')} onClick={() => setLang('pt')}>PT</button>
        </div>
      </div>

      {c.sections.map((sec, i) => (
        <div key={i} style={styles.section}>
          <h2 style={styles.sectionTitle}>{sec.title}</h2>
          <div style={styles.sectionBody}>
            {sec.content && <p style={styles.content}>{sec.content}</p>}
            {sec.warning && !sec.steps && <div style={styles.warning}>⚠️ {sec.warning}</div>}
            {sec.intro && <p style={styles.intro}>{sec.intro}</p>}
            {sec.warning && sec.steps && <div style={styles.warning}>⚠️ {sec.warning}</div>}
            {sec.steps && sec.steps.map((s, j) => (
              <div key={j} style={styles.stepRow}>
                <span style={styles.stepBadge}>{s.step}</span>
                <div>
                  <div style={styles.stepTitle}>{s.title}</div>
                  {s.desc && <div style={styles.stepDesc}>{s.desc}</div>}
                </div>
              </div>
            ))}
            {sec.table && (
              <ResponsiveTable
                headers={sec.table.headers}
                rows={sec.table.rows}
                isMobile={isMobile}
              />
            )}
            {sec.tip && <div style={styles.tip}>✅ {sec.tip}</div>}
            {sec.note && <div style={styles.note}>💡 {sec.note}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
