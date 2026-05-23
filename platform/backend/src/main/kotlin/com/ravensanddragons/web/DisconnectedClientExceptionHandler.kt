package com.ravensanddragons.web

import org.springframework.core.Ordered
import org.springframework.core.annotation.Order
import org.springframework.web.bind.annotation.ControllerAdvice
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.util.DisconnectedClientHelper
import java.io.IOException

@ControllerAdvice
@Order(Ordered.HIGHEST_PRECEDENCE)
class DisconnectedClientExceptionHandler {
    private val disconnectedClientHelper = DisconnectedClientHelper(javaClass.name)

    @ExceptionHandler(IOException::class)
    fun handleIOException(exception: IOException) {
        if (isDisconnectedClientException(exception)) {
            disconnectedClientHelper.checkAndLogClientDisconnectedException(exception)
            return
        }
        throw exception
    }

    internal fun isDisconnectedClientException(exception: Throwable): Boolean =
        DisconnectedClientHelper.isClientDisconnectedException(exception)
}
