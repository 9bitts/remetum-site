import { LegalPage } from "@/components/LegalPage";

export const metadata = {
  title: "Suporte · Remetum",
  description: "Como falar com o suporte do Remetum.",
};

export default function SupportPage() {
  return (
    <LegalPage title="Suporte" updated="16 de agosto de 2026">
      <p>
        Precisa de ajuda com login, conta, denúncia ou o aplicativo Android?
        Escreva para{" "}
        <a className="text-ebano-accent hover:underline" href="mailto:hello@remetum.com">
          hello@remetum.com
        </a>
        .
      </p>
      <p>Informe, se possível:</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>e-mail da conta ou apelido (@handle);</li>
        <li>aparelho e versão do Android;</li>
        <li>o que aconteceu e quando;</li>
        <li>print da tela, sem expor conversas de outras pessoas.</li>
      </ul>
      <p>
        Para apagar a conta, abra Configurações no app e use “Apagar conta”, ou
        peça pelo mesmo e-mail.
      </p>
    </LegalPage>
  );
}
