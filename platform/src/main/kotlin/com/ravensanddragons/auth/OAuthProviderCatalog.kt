package com.ravensanddragons.auth

import org.springframework.beans.factory.ObjectProvider
import org.springframework.security.oauth2.client.registration.ClientRegistration
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository
import org.springframework.stereotype.Component

@Component
class OAuthProviderCatalog(
    private val clientRegistrationRepositoryProvider: ObjectProvider<ClientRegistrationRepository>
) {
    fun availableProviders(): List<String> {
        val repository = clientRegistrationRepositoryProvider.ifAvailable ?: return emptyList()
        val registrations = repository as? Iterable<*> ?: return emptyList()
        return registrations
            .filterIsInstance<ClientRegistration>()
            .map(ClientRegistration::getRegistrationId)
            .sorted()
    }
}
