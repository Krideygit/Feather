package feather;

import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.util.function.BooleanSupplier;

final class Net {
    private Net() {}

    static boolean isPortFree(int port) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 200);
            return false;
        } catch (IOException ignored) {
        }
        try (ServerSocket ss = new ServerSocket()) {
            ss.setReuseAddress(false);
            ss.bind(new InetSocketAddress(port));
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    static boolean isOpen(int port) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), 300);
            return true;
        } catch (IOException e) {
            return false;
        }
    }

    static boolean waitForPort(int port, long timeoutMs, BooleanSupplier alive) throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            if (isOpen(port)) return true;
            if (!alive.getAsBoolean()) return false;
            Thread.sleep(250);
        }
        return false;
    }
}
