/**
 * Card art, keyed by card id.
 *
 * Files live under `public/sabotage_icons/<round>/`, one folder per round, named
 * `<round><side>_<slug>.PNG` by the designer (`2d_` = round 2 defender). The
 * slug is theirs, not ours, so where the two drifted the mapping is the record:
 * `3d_guardrails` is Assistant Restrictions and `3d_scan_first` is Scan the File
 * First. A card with no entry keeps no icon slot at all, so a round is playable
 * on the side whose art has landed.
 */
export const CARD_ICONS: Partial<Record<string, string>> = {
  // round 1 · attacker
  fake_sign_in_page: '/sabotage_icons/r1/1a_fake_sign_in.PNG',
  malicious_attachment: '/sabotage_icons/r1/1a_malicious.PNG',
  personal_details: '/sabotage_icons/r1/1a_personal_details.PNG',
  fake_sender_name: '/sabotage_icons/r1/1a_fake_sender.PNG',
  urgent_deadline: '/sabotage_icons/r1/1a_urgent_deadline.PNG',
  // round 1 · defender
  block_spam: '/sabotage_icons/r1/1d_block_spam.PNG',
  verify_sender: '/sabotage_icons/r1/1d_verify_sender.PNG',
  scan_link: '/sabotage_icons/r1/1d_scan_link.PNG',
  security_training: '/sabotage_icons/r1/1d_training.PNG',
  report_phishing: '/sabotage_icons/r1/1d_report_phishing.PNG',

  // round 2 · attacker
  deepfake_video: '/sabotage_icons/r2/2a_deepfake.PNG',
  urgent_wire: '/sabotage_icons/r2/2a_urgent_transfer.PNG',
  lookalike_website: '/sabotage_icons/r2/2a_lookalike.PNG',
  do_not_escalate: '/sabotage_icons/r2/2a_dont_escalate.PNG',
  vishing_call: '/sabotage_icons/r2/2a_vishing_call.PNG',
  // round 2 · defender
  callback_verification: '/sabotage_icons/r2/2d_callback_verification.PNG',
  payment_approval: '/sabotage_icons/r2/2d_payment_approval.PNG',
  verify_identity: '/sabotage_icons/r2/2d_identity_verification.PNG',
  escalate_manager: '/sabotage_icons/r2/2d_manager_escalation.PNG',
  address_check: '/sabotage_icons/r2/2d_hidden_address.PNG',

  // round 3 · attacker
  malicious_script: '/sabotage_icons/r3/3a_ai_script.PNG',
  hidden_script: '/sabotage_icons/r3/3a_hidden_script.PNG',
  jailbreak: '/sabotage_icons/r3/3a_jailbreak.PNG',
  exfiltrate: '/sabotage_icons/r3/3a_exfiltrate.PNG',
  false_rule: '/sabotage_icons/r3/3a_false_rule.PNG',
  // round 3 · defender
  read_only: '/sabotage_icons/r3/3d_read_only.PNG',
  human_in_the_loop: '/sabotage_icons/r3/3d_human_in_loop.PNG',
  scan_file: '/sabotage_icons/r3/3d_scan_first.PNG',
  assistant_restrictions: '/sabotage_icons/r3/3d_guardrails.PNG',
  human_approval: '/sabotage_icons/r3/3d_human_approval.PNG',

  // round 4 · attacker. Lookalike Website is the one card played in two rounds;
  // the designer's round 4 export was byte-identical to the round 2 file, so it
  // maps to the single copy already listed above.
  poison_source: '/sabotage_icons/r4/4a_poison_data.PNG',
  insider_edit: '/sabotage_icons/r4/4a_malicious_edit.PNG',
  auto_sync: '/sabotage_icons/r4/4a_auto_sync.PNG',
  outdated_upload: '/sabotage_icons/r4/4a_outdated_file.PNG',
  // round 4 · defender
  verify_source: '/sabotage_icons/r4/4d_verify_the_source.PNG',
  approved_sources: '/sabotage_icons/r4/4d_approved_source_only.PNG',
  human_approval_signoff: '/sabotage_icons/r4/4d_human_approval.PNG',
  source_list: '/sabotage_icons/r4/4d_approved_list.PNG',
  source_required: '/sabotage_icons/r4/4d_source_required.PNG',
}

/**
 * Whether a whole deck is illustrated.
 *
 * Half a hand with art reads as a broken screen, not as a work in progress, so
 * a deck shows art only once every card in it has some. Every deck is complete
 * today; the rule stays so the next round of art can land one side at a time.
 */
export function deckHasArt(deck: string[]): boolean {
  return deck.length > 0 && deck.every((id) => id in CARD_ICONS)
}
