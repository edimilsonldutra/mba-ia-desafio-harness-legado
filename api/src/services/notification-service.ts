export function formatTicketRef(ticket: { id: string; title: string }) {
  return `#${ticket.id.slice(0, 8)} (${ticket.title})`
}

export function notifyAssignee(ticket: { id: string; title: string }, assigneeId: string) {
  console.log(`[notificacao] chamado ${formatTicketRef(ticket)} atribuido para ${assigneeId}`)
}
