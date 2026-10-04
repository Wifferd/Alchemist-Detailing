#!/usr/bin/env python3
"""Sends a whole SQL file to the local test Postgres as ONE simple query,
the way Supabase's SQL Editor sends a script, and prints the last result set,
any error, and the time taken. Local only; trust authentication on the socket.
(A minimal client for the Postgres wire protocol, version 3.0.)

Usage: run_as_one_query.py <file.sql> <database>
"""
import socket
import struct
import sys
import time

SOCKET = '/home/claude/.pgtest/.s.PGSQL.54329'


def read_exact(sock, n):
    data = b''
    while len(data) < n:
        chunk = sock.recv(n - len(data))
        if not chunk:
            raise ConnectionError('connection closed')
        data += chunk
    return data


def read_message(sock):
    kind = read_exact(sock, 1)
    (length,) = struct.unpack('!i', read_exact(sock, 4))
    return kind, read_exact(sock, length - 4)


def fields(payload):
    """ErrorResponse / NoticeResponse fields as a dict of code -> text."""
    out = {}
    for part in payload.split(b'\0'):
        if part:
            out[chr(part[0])] = part[1:].decode('utf-8', 'replace')
    return out


def main():
    path, database = sys.argv[1], sys.argv[2]
    sql = open(path, encoding='utf-8').read()
    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.connect(SOCKET)
    params = b'user\0postgres\0database\0' + database.encode() + b'\0application_name\0one-query-dry-run\0\0'
    sock.sendall(struct.pack('!ii', 8 + len(params), 196608) + params)
    while True:
        kind, payload = read_message(sock)
        if kind == b'R' and struct.unpack('!i', payload[:4])[0] != 0:
            sys.exit('authentication other than trust is not supported')
        if kind == b'E':
            sys.exit('connect failed: ' + str(fields(payload)))
        if kind == b'Z':
            break

    body = sql.encode('utf-8') + b'\0'
    started = time.time()
    sock.sendall(b'Q' + struct.pack('!i', 4 + len(body)) + body)
    columns, rows, last_columns, last_rows = [], [], [], []
    completed, notices, error, status = 0, [], None, None
    while True:
        kind, payload = read_message(sock)
        if kind == b'T':
            (n,) = struct.unpack('!h', payload[:2])
            columns, rows, pos = [], [], 2
            for _ in range(n):
                end = payload.index(b'\0', pos)
                columns.append(payload[pos:end].decode())
                pos = end + 1 + 18
        elif kind == b'D':
            (n,) = struct.unpack('!h', payload[:2])
            pos, row = 2, []
            for _ in range(n):
                (size,) = struct.unpack('!i', payload[pos:pos + 4])
                pos += 4
                if size < 0:
                    row.append(None)
                else:
                    row.append(payload[pos:pos + size].decode('utf-8', 'replace'))
                    pos += size
            rows.append(row)
        elif kind == b'C':
            completed += 1
            if columns:
                last_columns, last_rows = columns, rows
            columns, rows = [], []
        elif kind == b'N':
            notices.append(fields(payload))
        elif kind == b'E':
            error = fields(payload)
        elif kind == b'Z':
            status = payload.decode()
            break
    sock.sendall(b'X' + struct.pack('!i', 4))
    sock.close()

    print(f'statements completed: {completed}; seconds: {time.time() - started:.1f}; '
          f'transaction status at the end: {status} (I = idle, T = open, E = failed)')
    for n in notices:
        if n.get('V') not in ('NOTICE', 'DEBUG', 'LOG', 'INFO'):
            print('  ', n.get('V'), n.get('M'))
    if error:
        print('ERROR:', error.get('C'), error.get('M'), '|', error.get('D', ''), '|', error.get('W', '')[:300])
        sys.exit(1)
    print('last result:', last_columns)
    for r in last_rows:
        print('  ', r)


if __name__ == '__main__':
    main()
