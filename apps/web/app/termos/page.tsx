import { LegalPage } from "@/components/LegalPage";

export const metadata = {
  title: "Termos de uso · Remetum",
  description: "Regras de uso da conta, conteúdo e comunidade no Remetum.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Termos de uso" updated="16 de agosto de 2026">
      <p>
        Estes termos regem o uso do Remetum no site e no aplicativo Android. Ao
        criar uma conta, você concorda com eles e com a{" "}
        <a className="text-ebano-accent hover:underline" href="/privacidade">
          Política de privacidade
        </a>
        .
      </p>

      <h2 className="pt-4 text-base font-semibold text-ebano-text">
        1. O serviço
      </h2>
      <p>
        O Remetum é um aplicativo de mensagens: conversas 1:1, grupos,
        comunidade, mídia, status e chamadas de voz/vídeo. O serviço é oferecido
        “como está”, sujeito a manutenção e evolução.
      </p>

      <h2 className="pt-4 text-base font-semibold text-ebano-text">
        2. Conta
      </h2>
      <p>
        Você precisa de e-mail válido e senha com no mínimo 8 caracteres. É
        responsável por manter a conta segura e por tudo o que ocorrer nela.
        Uma pessoa, uma conta. Menores de 13 anos não podem usar o Remetum.
      </p>

      <h2 className="pt-4 text-base font-semibold text-ebano-text">
        3. Conteúdo e conduta
      </h2>
      <p>
        Você é dono do que envia e nos concede licença limitada para armazenar e
        transmitir esse conteúdo só para operar o serviço. É proibido:
      </p>
      <ul className="list-disc space-y-2 pl-5">
        <li>assédio, ameaça, discurso de ódio ou exploração sexual;</li>
        <li>spam, malware, engenharia social ou acesso não autorizado;</li>
        <li>violação de direitos autorais, privacidade ou lei aplicável;</li>
        <li>suplantar outra pessoa ou usar o serviço para crime.</li>
      </ul>
      <p>
        A comunidade é pública entre pessoas cadastradas. Não envie ali o que
        não poderia ser visto por desconhecidos.
      </p>

      <h2 className="pt-4 text-base font-semibold text-ebano-text">
        4. Denúncia e bloqueio
      </h2>
      <p>
        Você pode bloquear usuários nas configurações. Para denunciar abuso,
        escreva para{" "}
        <a className="text-ebano-accent hover:underline" href="mailto:hello@remetum.com">
          hello@remetum.com
        </a>{" "}
        com o apelido, prints e o motivo. Podemos remover conteúdo, suspender ou
        encerrar contas que violem estes termos.
      </p>

      <h2 className="pt-4 text-base font-semibold text-ebano-text">
        5. Encerramento
      </h2>
      <p>
        Você pode apagar a conta nas configurações. Podemos encerrar o acesso em
        caso de violação, risco à segurança ou descontinuação do serviço, com o
        aviso razoável que for possível.
      </p>

      <h2 className="pt-4 text-base font-semibold text-ebano-text">
        6. Limitação
      </h2>
      <p>
        O Remetum não responde por mensagens de outros usuários, indisponibilidade
        temporária, perda de dados por fatores fora do nosso controle razoável,
        nem por uso indevido da plataforma. Na medida permitida pela lei
        brasileira, a responsabilidade limita-se ao que for necessário para
        repor o serviço.
      </p>

      <h2 className="pt-4 text-base font-semibold text-ebano-text">
        7. Contato
      </h2>
      <p>
        Dúvidas:{" "}
        <a className="text-ebano-accent hover:underline" href="mailto:hello@remetum.com">
          hello@remetum.com
        </a>
        . Foro: Brasil, na forma da legislação vigente.
      </p>
    </LegalPage>
  );
}
