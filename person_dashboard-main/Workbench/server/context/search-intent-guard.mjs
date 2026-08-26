const UNSAFE_SEARCH_INTENT_RULES = Object.freeze([
  Object.freeze({ code: 'permission_bypass', pattern: /(?:忽略|绕过|跳过|关闭).{0,12}(?:权限|授权|访问控制|策略)/u }),
  Object.freeze({ code: 'hidden_scope_disclosure', pattern: /(?:透露|显示|读取|列出).{0,12}(?:隐藏|未授权|其他项目|越权)/u }),
  Object.freeze({ code: 'internal_instruction_disclosure', pattern: /(?:系统提示词|内部策略|隐藏指令|开发者指令)/u }),
  Object.freeze({ code: 'destructive_instruction', pattern: /(?:删除|清空|覆盖|篡改).{0,18}(?:审计|记录|长期记忆|事实|权限)/u }),
  Object.freeze({ code: 'external_exfiltration', pattern: /(?:发送|导出|上传|同步).{0,18}(?:所有文档|全部正文|外部服务|第三方)/u }),
])

export function classifySearchIntent(query) {
  const normalized = String(query || '').trim()
  const matched = UNSAFE_SEARCH_INTENT_RULES.find((rule) => rule.pattern.test(normalized))
  return Object.freeze({
    allowed: !matched,
    reason_code: matched?.code ?? null,
  })
}

export function shouldRefuseSearch(query) {
  return classifySearchIntent(query).allowed === false
}
