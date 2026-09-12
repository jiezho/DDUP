const EVIDENCE_SAFETY_RULES = Object.freeze([
  Object.freeze({
    code: 'instruction_override',
    pattern: /(?:忽略|无视|跳过|覆盖|ignore|disregard|override).{0,40}(?:之前|先前|已有|previous|prior|earlier).{0,24}(?:指令|提示|规则|instructions?|prompts?|rules?)/iu,
  }),
  Object.freeze({
    code: 'role_impersonation',
    pattern: /(?:你现在是|从现在开始你是|扮演|you are now|act as).{0,40}(?:系统|管理员|开发者|system|administrator|developer)/iu,
  }),
  Object.freeze({
    code: 'secret_disclosure',
    pattern: /(?:输出|透露|泄露|显示|打印|print|reveal|expose|disclose).{0,40}(?:系统提示词|开发者指令|隐藏指令|密钥|令牌|system prompt|developer message|secret|token|api key)/iu,
  }),
  Object.freeze({
    code: 'external_exfiltration',
    pattern: /(?:发送|上传|同步|转发|send|upload|post|forward).{0,48}(?:外部|第三方|陌生服务器|webhook|external|third[ -]?party|remote server)/iu,
  }),
])

export function classifyEvidenceSafety(texts) {
  for (const value of Array.isArray(texts) ? texts : []) {
    const text = String(value || '')
    const matched = EVIDENCE_SAFETY_RULES.find((rule) => rule.pattern.test(text))
    if (matched) return Object.freeze({ allowed: false, reason_code: matched.code })
  }
  return Object.freeze({ allowed: true, reason_code: null })
}
