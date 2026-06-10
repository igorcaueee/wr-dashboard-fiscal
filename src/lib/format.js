export function formatBRL(value) {
  if (value == null || isNaN(value)) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatPercent(value) {
  if (value == null || isNaN(value)) return '0,00%';
  return value.toFixed(2).replace('.', ',') + '%';
}

export function formatCNPJ(cnpj) {
  if (!cnpj) return '';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5'
  );
}

export function formatDateBR(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('pt-BR');
}

export function formatMesAno(periodo) {
  if (!periodo) return '';
  const [mes, ano] = periodo.split('/');
  const meses = [
    'jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.',
    'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.',
  ];
  return `${meses[parseInt(mes) - 1]} de ${ano}`;
}

export function excelSerialToDate(serial) {
  if (!serial && serial !== 0) return null;
  const excelEpoch = new Date(1899, 11, 30);
  const msPerDay = 86400000;
  let days = parseInt(serial);
  if (days > 60) days -= 2;
  const date = new Date(excelEpoch.getTime() + days * msPerDay);
  return date;
}

export function excelSerialToMesAno(serial) {
  const date = excelSerialToDate(serial);
  if (!date) return null;
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const ano = date.getFullYear();
  return `${mes}/${ano}`;
}

export function periodoToSort(periodo) {
  if (!periodo) return 0;
  const [mes, ano] = periodo.split('/');
  return parseInt(ano) * 100 + parseInt(mes);
}