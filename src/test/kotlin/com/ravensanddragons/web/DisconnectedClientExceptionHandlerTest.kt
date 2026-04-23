package com.ravensanddragons.web

import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.web.context.request.async.AsyncRequestNotUsableException
import java.io.IOException

class DisconnectedClientExceptionHandlerTest {
    private val handler = DisconnectedClientExceptionHandler()

    @Test
    fun `broken pipe exception is treated as a disconnected client`() {
        handler.handleIOException(IOException("Broken pipe"))
    }

    @Test
    fun `async request not usable exception is treated as a disconnected client`() {
        handler.handleIOException(AsyncRequestNotUsableException("Response not usable after response errors."))
    }

    @Test
    fun `other io exceptions are rethrown`() {
        val exception = IOException("Unexpected failure")

        val thrown = assertThrows<IOException> {
            handler.handleIOException(exception)
        }

        assertSame(exception, thrown)
    }
}
