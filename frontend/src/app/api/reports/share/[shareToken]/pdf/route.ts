export async function GET(
  _request: Request,
  context: { params: Promise<{ shareToken: string }> },
): Promise<Response> {
  const { shareToken } = await context.params;
  const response = await fetch(
    `${process.env.BACKEND_INTERNAL_URL ?? "http://localhost:3001"}/reports/share/${shareToken}/pdf`,
    { cache: "no-store" },
  );
  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json",
      "Content-Disposition":
        response.headers.get("Content-Disposition") ?? 'attachment; filename="codeoracle-report.pdf"',
    },
  });
}
