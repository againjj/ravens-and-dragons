package com.dragonsvsravens.auth

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import jakarta.servlet.http.HttpSession
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.security.web.context.HttpSessionSecurityContextRepository
import org.springframework.stereotype.Component

@Component
class AuthSessionSupport {
    companion object {
        const val currentUserIdSessionAttribute = "auth.currentUserId"
        const val currentAuthTypeSessionAttribute = "auth.currentAuthType"
    }

    fun currentUserId(session: HttpSession?): String? =
        session?.getAttribute(currentUserIdSessionAttribute) as? String

    fun currentAuthType(session: HttpSession?): AuthType? =
        (session?.getAttribute(currentAuthTypeSessionAttribute) as? String)?.let(AuthType::valueOf)

    fun signIn(request: HttpServletRequest, response: HttpServletResponse, user: UserRecord) {
        val authentication = UsernamePasswordAuthenticationToken(
            user.id,
            null,
            listOf(SimpleGrantedAuthority("ROLE_USER"))
        )
        val context = SecurityContextHolder.createEmptyContext().also {
            it.authentication = authentication
        }
        SecurityContextHolder.setContext(context)
        val session = request.getSession(true)
        session.setAttribute(currentUserIdSessionAttribute, user.id)
        session.setAttribute(currentAuthTypeSessionAttribute, user.authType.name)
        HttpSessionSecurityContextRepository().saveContext(context, request, response)
    }

    fun signOut(session: HttpSession?) {
        SecurityContextHolder.clearContext()
        session?.invalidate()
    }
}
