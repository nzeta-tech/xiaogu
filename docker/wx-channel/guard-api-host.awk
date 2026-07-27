/仅处理 \/api\/ 请求/ {
	print "\trequestHost := strings.ToLower(strings.TrimSpace(Conn.Request.Host))"
	print "\tif requestHost != \"\" && !strings.HasPrefix(requestHost, \"127.0.0.1\") && !strings.HasPrefix(requestHost, \"localhost\") {"
	print "\t\treturn false"
	print "\t}"
}

{ print }
