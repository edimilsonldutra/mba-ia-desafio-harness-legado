import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// Idempotente: pode rodar a cada subida. As contas são criadas ou têm a senha
// e o papel restaurados; os chamados de exemplo só entram na primeira vez.
const accounts = [
  { name: 'Admin', email: 'admin@balcao.dev', password: 'Admin@123', role: 'admin' },
  { name: 'Ana Atendente', email: 'agente@balcao.dev', password: 'Agente@123', role: 'agent' },
  { name: 'Carlos Cliente', email: 'cliente@balcao.dev', password: 'Cliente@123', role: 'customer' },
] as const

async function upsertAccount(account: (typeof accounts)[number]) {
  const passwordHash = await bcrypt.hash(account.password, 10)
  return prisma.user.upsert({
    where: { email: account.email },
    update: { name: account.name, passwordHash, role: account.role },
    create: { name: account.name, email: account.email, passwordHash, role: account.role },
  })
}

async function main() {
  const firstRun = (await prisma.user.count({ where: { email: { in: accounts.map((a) => a.email) } } })) === 0
  const [admin, agent, customer] = await Promise.all(accounts.map(upsertAccount))

  if (firstRun) {
    await prisma.ticket.create({
      data: {
        title: 'Não consigo emitir a segunda via do boleto',
        description: 'Quando clico em segunda via aparece uma tela em branco. Preciso pagar até sexta.',
        customerId: customer.id,
      },
    })

    await prisma.ticket.create({
      data: {
        title: 'Erro ao salvar o perfil',
        description: 'Ao alterar o telefone no perfil aparece a mensagem "erro inesperado".',
        status: 'in_progress',
        category: 'technical',
        priority: 'medium',
        triageStatus: 'done',
        customerId: customer.id,
        assigneeId: agent.id,
        replies: {
          create: [{ authorId: agent.id, body: 'Oi, Carlos! Já estamos olhando o problema.' }],
        },
      },
    })

    await prisma.ticket.create({
      data: {
        title: 'Dúvida sobre troca de senha',
        description: 'Qual o tamanho mínimo de senha que o sistema aceita?',
        status: 'resolved',
        category: 'account',
        priority: 'low',
        triageStatus: 'done',
        customerId: customer.id,
        assigneeId: agent.id,
        replies: {
          create: [
            { authorId: agent.id, body: 'A senha precisa ter pelo menos 8 caracteres.' },
            { authorId: customer.id, body: 'Obrigado!' },
          ],
        },
      },
    })
  }

  console.log(`seed ok${firstRun ? '' : ' (contas atualizadas, chamados de exemplo já existiam)'}: ${admin.email}, ${agent.email}, ${customer.email}`)
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
