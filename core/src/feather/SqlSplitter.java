package feather;

import java.util.ArrayList;
import java.util.List;

final class SqlSplitter {
    private SqlSplitter() {}

    static List<String> split(String sql) {
        List<String> out = new ArrayList<>();
        String delimiter = ";";
        StringBuilder cur = new StringBuilder();
        int i = 0;
        int n = sql.length();
        while (i < n) {
            if (cur.toString().isBlank() && sql.regionMatches(true, i, "delimiter ", 0, 10)) {
                int eol = sql.indexOf('\n', i);
                if (eol < 0) eol = n;
                String d = sql.substring(i + 10, eol).trim();
                if (!d.isEmpty()) delimiter = d;
                cur.setLength(0);
                i = Math.min(n, eol + 1);
                continue;
            }
            char c = sql.charAt(i);
            if (c == '\'' || c == '"' || c == '`') {
                int end = endOfQuote(sql, i);
                cur.append(sql, i, end);
                i = end;
            } else if (c == '#' || (c == '-' && i + 1 < n && sql.charAt(i + 1) == '-'
                    && (i + 2 >= n || Character.isWhitespace(sql.charAt(i + 2))))) {
                int eol = sql.indexOf('\n', i);
                int end = eol < 0 ? n : eol;
                cur.append(sql, i, end);
                i = end;
            } else if (c == '/' && i + 1 < n && sql.charAt(i + 1) == '*') {
                int close = sql.indexOf("*/", i + 2);
                int end = close < 0 ? n : close + 2;
                cur.append(sql, i, end);
                i = end;
            } else if (sql.startsWith(delimiter, i)) {
                flush(out, cur);
                i += delimiter.length();
            } else {
                cur.append(c);
                i++;
            }
        }
        flush(out, cur);
        return out;
    }

    private static int endOfQuote(String s, int start) {
        char q = s.charAt(start);
        int i = start + 1;
        while (i < s.length()) {
            char c = s.charAt(i);
            if (c == '\\' && q != '`') {
                i += 2;
                continue;
            }
            if (c == q) {
                if (i + 1 < s.length() && s.charAt(i + 1) == q) {
                    i += 2;
                    continue;
                }
                return i + 1;
            }
            i++;
        }
        return s.length();
    }

    private static void flush(List<String> out, StringBuilder cur) {
        String s = cur.toString().trim();
        cur.setLength(0);
        if (!s.isEmpty() && !onlyComments(s)) out.add(s);
    }

    private static boolean onlyComments(String s) {
        int i = 0;
        int n = s.length();
        while (i < n) {
            char c = s.charAt(i);
            if (Character.isWhitespace(c)) {
                i++;
            } else if (c == '#' || (c == '-' && i + 1 < n && s.charAt(i + 1) == '-')) {
                int eol = s.indexOf('\n', i);
                i = eol < 0 ? n : eol + 1;
            } else if (c == '/' && i + 1 < n && s.charAt(i + 1) == '*') {
                int close = s.indexOf("*/", i + 2);
                i = close < 0 ? n : close + 2;
            } else {
                return false;
            }
        }
        return true;
    }
}
