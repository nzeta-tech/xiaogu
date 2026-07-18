export async function POST() {
  return Response.json({ error: "客户端扣费接口已停用，额度只能由具体业务服务端结算" }, { status: 410 });
}
