import { LegalPage } from "@/components/LegalPage";

export const metadata = {
  title: "Privacidade · Remetum",
  description: "Como o Remetum trata dados pessoais, mensagens e mídia.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Política de privacidade" updated="16 de agosto de 2026">
      <p>
        Esta política descreve como o Remetum (remetum.com e o aplicativo
        Android) trata dados pessoais, em conformidade com a Lei Geral de
        Proteção de Dados (Lei nº 13.709/2018).
      </p>
      <p>
        Controlador: operação Remetum. Contato:{" "}
        <a className="text-ebano-accent hover:underline" href="mailto:hello@remetum.com">
          hello@remetum.com
        </a>
        .
      </p>

      <h2 className="pt-4 text-base font-semibold text-ebano-text">
        1. Dados que coletamos
      </h2>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong className="text-ebano-text">Conta:</strong> nome, e-mail, senha
          (armazenada só como hash), apelido opcional (@handle), foto e bio.
        </li>
        <li>
          <strong className="text-ebano-text">Conteúdo:</strong> mensagens de
          texto, imagens, arquivos, áudios, vídeos, status e reações que você
          envia.
        </li>
        <li>
          <strong className="text-ebano-text">Comunicação em tempo real:</strong>{" "}
          presença online, “digitando…”, confirmação de entrega/leitura e
          metadados de chamadas de voz/vídeo (não gravamos o áudio/vídeo da
          chamada).
        </li>
        <li>
          <strong className="text-ebano-text">Técnicos:</strong> sessão (cookies
          httpOnly), user-agent, IP da sessão, inscrição de notificação push e
          arquivos enviados.
        </li>
      </ul>

      <h2 className="pt-4 text-base font-semibold text-ebano-text">
        2. Para que usamos
      </h2>
      <p>
        Prestação do serviço de mensagens, autenticação, segurança da conta,
        entrega de mídia, chamadas, notificações, prevenção a abuso e cumprimento
        de obrigações legais. Base legal: execução de contrato (art. 7º, V, LGPD)
        e, quando cabível, legítimo interesse para segurança (art. 7º, IX).
      </p>

      <h2 className="pt-4 text-base font-semibold text-ebano-text">
        3. Com quem compartilhamos
      </h2>
      <p>
        Não vendemos dados. Operadores técnicos podem processar dados para
        hospedar o app, armazenar arquivos, enviar e-mail e viabilizar chamadas
        (por exemplo provedores de nuvem, armazenamento de objetos e
        infraestrutura de áudio/vídeo). Conteúdo de conversas é visível aos
        participantes da conversa, do grupo ou da comunidade.
      </p>

      <h2 className="pt-4 text-base font-semibold text-ebano-text">
        4. Permissões do aplicativo Android
      </h2>
      <p>
        Câmera e microfone são usados só para fotos, mensagens de voz e chamadas,
        quando você autoriza. Notificações avisam mensagens e chamadas. Internet
        é necessária para o serviço.
      </p>

      <h2 className="pt-4 text-base font-semibold text-ebano-text">
        5. Retenção e exclusão
      </h2>
      <p>
        Mantemos a conta e o conteúdo enquanto você usar o Remetum. Status
        expiram automaticamente. Você pode apagar a conta nas configurações; isso
        remove o perfil e os dados associados, salvo o que a lei exigir
        conservar. Mensagens já entregues a outras pessoas podem permanecer nas
        contas delas.
      </p>

      <h2 className="pt-4 text-base font-semibold text-ebano-text">
        6. Seus direitos
      </h2>
      <p>
        Você pode acessar, corrigir, exportar o que estiver disponível na
        interface, limitar recibos de leitura/último acesso e solicitar exclusão
        pelo app ou em hello@remetum.com. Também pode revogar sessões e
        desativar notificações no aparelho.
      </p>

      <h2 className="pt-4 text-base font-semibold text-ebano-text">
        7. Crianças
      </h2>
      <p>
        O Remetum não se destina a menores de 13 anos. Não coletamos dados de
        crianças de forma intencional.
      </p>

      <h2 className="pt-4 text-base font-semibold text-ebano-text">
        8. Alterações
      </h2>
      <p>
        Podemos atualizar esta política. A data no topo indica a versão vigente.
        Uso continuado após a publicação constitui ciência da nova versão.
      </p>
    </LegalPage>
  );
}
