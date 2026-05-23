package com.ravensanddragons.auth

fun interface UserReferenceCleanup {
    fun clearUserReferences(userId: String)
}
