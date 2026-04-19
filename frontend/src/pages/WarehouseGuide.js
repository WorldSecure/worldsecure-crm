import React, { useState, useEffect } from 'react';

const content = {
  en: {
    title: '📖 Warehouse User Guide',
    sections: [
      {
        title: '1. Warehouse Dashboard',
        content: 'The Dashboard shows a real-time summary: Total Products, Total Inbound transactions, and Total Outbound transactions.'
      },
      {
        title: '2. Inbound — Receiving Goods',
        intro: 'Record every delivery received from a supplier as a new Inbound transaction.',
        steps: [
          { step: 'Step 1', title: 'Click "New Inbound"', desc: 'Blue button at the top right of the Inbound screen' },
          { step: 'Step 2', title: 'Select Supplier Type', desc: 'Registered (exists in system) or Unregistered' },
          { step: 'Step 3', title: 'Select Supplier', desc: 'Choose from the dropdown list' },
          { step: 'Step 4', title: 'Add Items', desc: 'Select product → enter quantity → click "Add Item". Repeat for each product received.' },
          { step: 'Step 5', title: 'General Notes', desc: 'Optional notes about the delivery' },
          { step: 'Step 6', title: 'Generate Receipt Note', desc: 'Check "Generate receipt note after saving" to create a receipt PDF automatically' },
          { step: 'Step 7', title: 'Click "Save Transaction"', desc: 'Stock levels are updated automatically' },
        ],
        tip: 'After saving, click "Receipt Note" in the Actions column to view and print the receipt document.'
      },
      {
        title: '3. Outbound — Shipping Goods',
        intro: 'Record every shipment leaving the warehouse.',
        steps: [
          { step: 'Step 1', title: 'Click "New Outbound"', desc: 'Blue button at the top right of the Outbound screen' },
          { step: 'Step 2', title: 'Select Customer Type', desc: 'Registered or Unregistered' },
          { step: 'Step 3', title: 'Select Customer', desc: 'Choose from the dropdown list' },
          { step: 'Step 4', title: 'Set Status', desc: 'Pending / In Progress / Shipped' },
          { step: 'Step 5', title: 'Add Items', desc: 'Select product → enter quantity → click "Add Item". Available stock is shown next to each product.' },
          { step: 'Step 6', title: 'Packaging', desc: 'Choose: No packaging / Carton Packaging / Pallet Division (see below)' },
          { step: 'Step 7', title: 'Click "Save Transaction"', desc: 'Stock levels are reduced automatically' },
        ],
        tip: 'After saving, click "Delivery Note" to view, print or email the delivery note to the customer.',
        warning: 'Always check available stock before creating an outbound. Never ship more than what is in stock.'
      },
      {
        title: '4. Packaging Options',
        table: {
          headers: ['Option', 'When to use', 'What to enter'],
          rows: [
            ['Continue without packaging', 'Items shipped as-is, no packaging details needed', '—'],
            ['Carton Packaging', 'Items packed into cartons', 'Items per carton + Carton weight (kg) → system calculates number of cartons'],
            ['Pallet Division', 'Cartons loaded onto pallets', 'Cartons per pallet + Pallet dimensions + Pallet weight → system calculates number of pallets'],
          ]
        },
        note: 'Pallet Division is only available after completing Carton Packaging.'
      },
      {
        title: '5. Outbound Statuses',
        table: {
          headers: ['Status', 'Meaning'],
          rows: [
            ['Pending', 'Transaction created, goods not yet shipped'],
            ['In Progress', 'Shipment is being prepared'],
            ['Shipped', 'Goods have been shipped to the customer'],
          ]
        }
      }
    ]
  },
  pt: {
    title: '📖 Guia do Utilizador — Armazém',
    sections: [
      {
        title: '1. Painel do Armazém',
        content: 'O painel mostra um resumo em tempo real: Total de Produtos, Total de Entradas e Total de Saídas.'
      },
      {
        title: '2. Entrada — Receber Mercadorias',
        intro: 'Registar cada entrega recebida de um fornecedor como uma nova transação de Entrada.',
        steps: [
          { step: 'Passo 1', title: 'Clique em "New Inbound"', desc: 'Botão azul no canto superior direito do ecrã de Entrada' },
          { step: 'Passo 2', title: 'Selecionar Tipo de Fornecedor', desc: 'Registado (existe no sistema) ou Não Registado' },
          { step: 'Passo 3', title: 'Selecionar Fornecedor', desc: 'Escolher da lista suspensa' },
          { step: 'Passo 4', title: 'Adicionar Itens', desc: 'Selecionar produto → inserir quantidade → clicar em "Add Item". Repetir para cada produto recebido.' },
          { step: 'Passo 5', title: 'Notas Gerais', desc: 'Notas opcionais sobre a entrega' },
          { step: 'Passo 6', title: 'Gerar Nota de Recepção', desc: 'Marcar "Generate receipt note after saving" para criar um PDF automaticamente' },
          { step: 'Passo 7', title: 'Clique em "Save Transaction"', desc: 'Os níveis de stock são atualizados automaticamente' },
        ],
        tip: 'Após guardar, clique em "Receipt Note" na coluna Ações para ver e imprimir o documento de recepção.'
      },
      {
        title: '3. Saída — Enviar Mercadorias',
        intro: 'Registar cada envio que sai do armazém.',
        steps: [
          { step: 'Passo 1', title: 'Clique em "New Outbound"', desc: 'Botão azul no canto superior direito do ecrã de Saída' },
          { step: 'Passo 2', title: 'Selecionar Tipo de Cliente', desc: 'Registado ou Não Registado' },
          { step: 'Passo 3', title: 'Selecionar Cliente', desc: 'Escolher da lista suspensa' },
          { step: 'Passo 4', title: 'Definir Estado', desc: 'Pendente / Em Progresso / Enviado' },
          { step: 'Passo 5', title: 'Adicionar Itens', desc: 'Selecionar produto → inserir quantidade → clicar em "Add Item". O stock disponível é mostrado junto a cada produto.' },
          { step: 'Passo 6', title: 'Embalagem', desc: 'Escolher: Sem embalagem / Embalagem em Caixas / Divisão em Paletes (ver abaixo)' },
          { step: 'Passo 7', title: 'Clique em "Save Transaction"', desc: 'Os níveis de stock são reduzidos automaticamente' },
        ],
        tip: 'Após guardar, clique em "Delivery Note" para ver, imprimir ou enviar por email a guia de remessa ao cliente.',
        warning: 'Verifique sempre o stock disponível antes de criar uma saída. Nunca envie mais do que o disponível em stock.'
      },
      {
        title: '4. Opções de Embalagem',
        table: {
          headers: ['Opção', 'Quando usar', 'O que inserir'],
          rows: [
            ['Sem embalagem', 'Itens enviados sem detalhes de embalagem', '—'],
            ['Embalagem em Caixas', 'Itens embalados em caixas', 'Itens por caixa + Peso da caixa (kg) → o sistema calcula o número de caixas'],
            ['Divisão em Paletes', 'Caixas carregadas em paletes', 'Caixas por palete + Dimensões + Peso → o sistema calcula o número de paletes'],
          ]
        },
        note: 'A Divisão em Paletes só está disponível após concluir a Embalagem em Caixas.'
      },
      {
        title: '5. Estados das Saídas',
        table: {
          headers: ['Estado', 'Significado'],
          rows: [
            ['Pending', 'Transação criada, mercadoria ainda não enviada'],
            ['In Progress', 'Envio em preparação'],
            ['Shipped', 'Mercadoria enviada ao cliente'],
          ]
        }
      }
    ]
  }
};

export default function WarehouseGuide() {
  const systemLang = localStorage.getItem('language') || 'en';
  const defaultLang = systemLang === 'pt' ? 'pt' : 'en';
  const [lang, setLang] = useState(defaultLang);

  useEffect(() => {
    const l = localStorage.getItem('language') || 'en';
    setLang(l === 'pt' ? 'pt' : 'en');
  }, []);

  const c = content[lang];

  const styles = {
    container: { maxWidth: '860px', margin: '0 auto', padding: '2rem', fontFamily: 'Arial, sans-serif' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', borderBottom: '3px solid #2E75B6', paddingBottom: '1rem' },
    title: { fontSize: '1.8rem', fontWeight: 700, color: '#1B3A6B', margin: 0 },
    langToggle: { display: 'flex', gap: '0.5rem' },
    langBtn: (active) => ({ padding: '0.4rem 1rem', border: '2px solid #2E75B6', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', background: active ? '#2E75B6' : '#fff', color: active ? '#fff' : '#2E75B6', transition: 'all 0.2s' }),
    section: { marginBottom: '2rem', background: '#fff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' },
    sectionTitle: { background: '#1B3A6B', color: '#fff', padding: '0.8rem 1.2rem', fontSize: '1.05rem', fontWeight: 700, margin: 0 },
    sectionBody: { padding: '1.2rem' },
    intro: { color: '#444', marginBottom: '1rem', fontSize: '0.95rem' },
    content: { color: '#444', fontSize: '0.95rem', margin: 0 },
    stepRow: { display: 'flex', gap: '0.8rem', marginBottom: '0.6rem', alignItems: 'flex-start' },
    stepBadge: { background: '#2E75B6', color: '#fff', borderRadius: '6px', padding: '0.2rem 0.6rem', fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap', marginTop: '2px' },
    stepTitle: { fontWeight: 700, color: '#1B3A6B', fontSize: '0.95rem' },
    stepDesc: { color: '#555', fontSize: '0.9rem' },
    tip: { background: '#D4EDDA', borderLeft: '4px solid #1E7E34', borderRadius: '4px', padding: '0.7rem 1rem', marginTop: '1rem', color: '#155724', fontSize: '0.9rem' },
    warning: { background: '#F8D7DA', borderLeft: '4px solid #CC0000', borderRadius: '4px', padding: '0.7rem 1rem', marginTop: '0.5rem', color: '#721C24', fontSize: '0.9rem' },
    note: { background: '#FFF3CD', borderLeft: '4px solid #FFA500', borderRadius: '4px', padding: '0.7rem 1rem', marginTop: '1rem', color: '#856404', fontSize: '0.9rem' },
    table: { width: '100%', borderCollapse: 'collapse', marginTop: '0.5rem', fontSize: '0.9rem' },
    th: { background: '#D5E8F0', color: '#1B3A6B', fontWeight: 700, padding: '0.6rem 0.8rem', textAlign: 'left', border: '1px solid #BBBBBB' },
    td: (shade) => ({ padding: '0.6rem 0.8rem', border: '1px solid #BBBBBB', background: shade ? '#F7F7F7' : '#fff', color: '#555', verticalAlign: 'top' }),
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
            {sec.intro && <p style={styles.intro}>{sec.intro}</p>}
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
              <table style={styles.table}>
                <thead>
                  <tr>{sec.table.headers.map((h, j) => <th key={j} style={styles.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {sec.table.rows.map((row, j) => (
                    <tr key={j}>{row.map((cell, k) => <td key={k} style={styles.td(j % 2 === 1)}>{cell}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            )}
            {sec.tip && <div style={styles.tip}>✅ {sec.tip}</div>}
            {sec.warning && <div style={styles.warning}>⚠️ {sec.warning}</div>}
            {sec.note && <div style={styles.note}>💡 {sec.note}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
