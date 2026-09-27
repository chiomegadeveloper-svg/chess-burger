export const AGREEMENT_VERSION = "2026-09-27";

export function EndUserAgreement() {
  return (
    <div className="agreement-copy">
      <p><strong>Chess Burger End User Agreement</strong> · Version {AGREEMENT_VERSION}</p>
      <p>By accepting, you agree to these rules for your Chess Burger account and use of the app. If you do not agree, choose Exit app.</p>
      <h3>Your account</h3>
      <p>Provide accurate registration information, keep your sign-in details secure, and use your own account. Your username, profile picture, public posts, match activity, and other content you choose to share may be visible to other players. You are responsible for activity on your account.</p>
      <h3>Playing and community</h3>
      <p>Play fairly. Do not use unauthorized assistance in player matches, manipulate results or rewards, impersonate others, harass players, post unlawful or abusive content, or interfere with the service. We may remove content or restrict accounts that break these rules. You can report problems and users using Report.</p>
      <h3>Credits and purchases</h3>
      <p>Chess Burger may offer game credits, rewards, rentals, and digital items. Their terms, duration, and prices are shown where offered. In-app balances and items have no cash value and cannot be exchanged for money through Chess Burger. Review the offer before confirming a purchase or gift.</p>
      <h3>Your content and privacy</h3>
      <p>You keep ownership of content you upload. You allow Chess Burger to store, display, and process that content to operate app features, including profiles, games, community posts, classes, reports, and support. Do not upload content you have no right to use. Contact the app owner through the Report feature for account or privacy questions.</p>
      <h3>Service changes</h3>
      <p>Chess Burger is a developing service. Features may change, be interrupted, or be removed. We may update this agreement and request your acceptance again before continued use. If you are under the age at which you can agree to these terms in your location, ask a parent or guardian to review them with you.</p>
    </div>
  );
}
